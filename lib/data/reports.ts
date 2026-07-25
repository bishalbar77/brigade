import {
  analyseMenu,
  dailyUsage,
  suggestReorder,
  type DishUsage,
  type ReorderSuggestion,
} from "@/lib/runway/inventory";
import type { DishPerformance, Velocity } from "@/lib/runway/types";
import { createSupabaseServerClient, getCurrentProfile } from "@/lib/supabase/server";
import { windowsForDate } from "@/lib/data/menu";
import type { DaypartWindow } from "@/lib/runway/velocity";
import { weekdayOf } from "@/lib/runway/velocity";
import { resolveTimeZone } from "@/lib/runway/clock";
import type { Station } from "@/lib/ops/tickets";

/**
 * Read-only ops reports: floor, pantry, menu costing, bookings, analytics.
 *
 * All of these run with the staff member's own session, so RLS decides what returns.
 *
 * COST VISIBILITY. `ingredients.cost_per_unit_cents` is only read when the caller is
 * owner or manager, and the role is checked here rather than trusted from a prop.
 *
 * The database enforces this too, as of patch 003: `ingredients_read` requires
 * is_manager(), and `ingredients_public` exists so non-manager staff keep their stock
 * counts without the cost columns. Asserted in scripts/sql-check.sh, so the role check
 * here is defence in depth rather than the only thing standing between a chef's session
 * and cost_per_unit_cents. (This comment previously described that gap as open long
 * after it was closed — a stale warning misleads in the same way a stale promise does.)
 */

const one = <T,>(rel: T | T[] | null | undefined): T | null =>
  rel == null ? null : Array.isArray(rel) ? (rel[0] ?? null) : rel;

const canSeeCost = (role: string | null | undefined) => role === "owner" || role === "manager";

/** PostgREST's server-side row cap on Supabase. A client `.limit()` cannot raise it. */
const PAGE = 1000;

type Rangeable<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>;
};

/**
 * Read EVERY row, not the first thousand.
 *
 * PostgREST enforces `db-max-rows` (1000 on Supabase) and a client-side `.limit(20000)`
 * cannot raise it — the request returns 1000 rows and HTTP 200, with the real count only
 * in the `content-range` header nobody reads. There is no error to notice.
 *
 * What that cost: /ops/analytics computed its food-cost ratio from 1000 of 3411 order
 * items and printed **5.9%**, directly above the line that names the 28–32% industry
 * band it compares against. Every per-dish "Sold" count was short by up to 8.7×, and the
 * twenty dish counts summed to exactly 1000, which is the tell. A physically impossible
 * number on the screen that carries the whole "intelligence layer" claim.
 *
 * Takes a builder FACTORY rather than a query, because a supabase-js builder executes
 * once and cannot be re-awaited with a different range.
 */
async function pageAll<T>(build: () => Rangeable<T>): Promise<T[]> {
  // First page also asks for the total, so the rest can be fetched at once.
  const first = await build().range(0, PAGE - 1);
  if (first.error || !first.data) return [];
  const rows: T[] = [...first.data];
  if (first.data.length < PAGE) return rows;

  const total = first.count ?? null;

  /*
   * Everything after page one, CONCURRENTLY.
   *
   * The sequential version of this loop cost /ops/analytics twelve seconds. Each Supabase
   * round trip from Vercel is roughly a second and a half, and 3411 order items plus 1350
   * orders is six pages — so paging correctly (which fixed the 5.9% food cost) traded one
   * wrong number for a screen nobody would wait for. Both were bugs; this is the version
   * that is neither.
   *
   * Needs the total, which is why the callers pass `{ count: "exact" }`. Without it there
   * is no way to know how many pages exist without asking for them one at a time, so the
   * fallback below stays sequential rather than guessing.
   */
  if (total !== null) {
    const pages = [];
    for (let offset = PAGE; offset < total; offset += PAGE) pages.push(offset);
    if (pages.length > 100) pages.length = 100; // backstop, ~100k rows
    const rest = await Promise.all(pages.map((o) => build().range(o, o + PAGE - 1)));
    for (const r of rest) if (!r.error && r.data) rows.push(...r.data);
    return rows;
  }

  for (let offset = PAGE; ; offset += PAGE) {
    const { data, error } = await build().range(offset, offset + PAGE - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    if (rows.length >= 100_000) break;
  }
  return rows;
}

/* ─────────────────────────────── floor ─────────────────────────────── */

export type TableStatus = "open" | "seated" | "dirty" | "held";

export interface FloorTable {
  id: string;
  label: string;
  seats: number;
  zone: string;
  status: TableStatus;
  /** Minutes since the open order was placed, when seated. */
  dwellMinutes: number | null;
  openOrderId: string | null;
  itemsAway: number;
  itemsTotal: number;
}

export interface FloorPayload {
  zones: { zone: string; tables: FloorTable[] }[];
  covers: number;
  openTables: number;
}

export async function getFloor(now: Date = new Date()): Promise<FloorPayload> {
  const supabase = await createSupabaseServerClient();

  const [{ data: tables }, { data: orders }] = await Promise.all([
    supabase.from("tables").select("id, label, seats, zone, status").order("label"),
    supabase
      .from("orders")
      .select("id, table_id, opened_at, order_items ( status )")
      .eq("status", "open"),
  ]);

  const byTable = new Map(
    (orders ?? []).map((o) => [
      o.table_id as string,
      {
        id: o.id as string,
        openedAt: o.opened_at as string,
        items: (o.order_items ?? []) as { status: string }[],
      },
    ]),
  );

  const rows: FloorTable[] = (tables ?? []).map((t) => {
    const order = byTable.get(t.id as string);
    const items = order?.items ?? [];
    return {
      id: t.id as string,
      label: t.label as string,
      seats: t.seats as number,
      zone: (t.zone as string) ?? "main",
      status: t.status as TableStatus,
      dwellMinutes: order
        ? Math.max(0, Math.floor((now.getTime() - new Date(order.openedAt).getTime()) / 60_000))
        : null,
      openOrderId: order?.id ?? null,
      itemsAway: items.filter((i) => i.status === "served").length,
      itemsTotal: items.filter((i) => i.status !== "voided").length,
    };
  });

  const zoneNames = [...new Set(rows.map((r) => r.zone))].sort();

  return {
    zones: zoneNames.map((zone) => ({ zone, tables: rows.filter((r) => r.zone === zone) })),
    covers: rows.filter((r) => r.status === "seated").reduce((n, r) => n + r.seats, 0),
    openTables: rows.filter((r) => r.status === "open").length,
  };
}

/* ───────────────────────────── pantry ───────────────────────────── */

export interface PantryRow {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  parLevel: number;
  reorderPoint: number;
  shelfLifeDays: number | null;
  leadTimeDays: number;
  supplierName: string | null;
  /** Only populated for owner/manager. */
  costPerUnitCents: number | null;
  suggestion: ReorderSuggestion;
  dailyUsageQty: number;
}

export interface PantryPayload {
  rows: PantryRow[];
  needsOrder: number;
  showCost: boolean;
}

export async function getPantry(now: Date = new Date()): Promise<PantryPayload> {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile();
  const showCost = canSeeCost(profile?.role);

  // The restaurant first, because its timezone decides which weekday to ask for. Reading
  // the weekday in the SERVER's zone was the other half of this bug: getPantry was the one
  // reader left that ignored restaurants.timezone, so near midnight it loaded the wrong
  // day's sell rates entirely.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("timezone, service_hours")
    .limit(1)
    .single();

  const timeZone = resolveTimeZone(restaurant?.timezone as string | null);

  const [{ data: ingredients }, { data: recipes }, { data: velocity }] = await Promise.all([
    supabase
      .from("ingredients")
      .select(
        "id, name, unit, stock_qty, par_level, reorder_point, shelf_life_days, cost_per_unit_cents, suppliers ( name, lead_time_days )",
      )
      .order("name"),
    supabase.from("recipe_items").select("dish_id, ingredient_id, qty"),
    // The WHOLE weekday, both dayparts. Filtering to the current daypart and then
    // multiplying by a day's worth of hours applies the dinner rush rate to lunchtime.
    supabase
      .from("dish_velocity")
      .select("dish_id, daypart, ewma_units_per_hour")
      .eq("weekday", weekdayOf(now, timeZone)),
  ]);

  // Keyed by dish AND daypart, because a dish sells at different rates over lunch and
  // dinner, and that difference is the entire reason velocity is stored per daypart.
  const rateFor = new Map<string, number>();
  for (const v of velocity ?? []) {
    rateFor.set(`${v.dish_id as string}:${v.daypart as string}`, Number(v.ewma_units_per_hour));
  }

  // Recipes grouped per dish, so daily usage can be summed across every dish that
  // uses an ingredient — the same maths the reorder point is built on.
  const byDish = new Map<string, { ingredientId: string; qty: number }[]>();
  for (const r of recipes ?? []) {
    const list = byDish.get(r.dish_id as string) ?? [];
    list.push({ ingredientId: r.ingredient_id as string, qty: Number(r.qty) });
    byDish.set(r.dish_id as string, list);
  }
  /*
   * Daily usage, summed window by window over the restaurant's REAL service hours.
   *
   * It used to be `oneDaypartRate × 11`, where 11 was a hardcoded "11:00 → 22:00" and the
   * rate came from whichever daypart happened to be current. Two errors in one line:
   * evaluated at dinner it charged the dinner rush rate to the whole day, and the day was
   * the wrong length (the seeded Saturday is 11:00–23:00, so twelve hours). Measured
   * against the shipped figures: King scallops overstated by 18%, red wine understated by
   * 10% — and the page prints the formula underneath ("daily usage × lead time × 1.2"),
   * so the arithmetic looks authoritative while the input to it is wrong.
   *
   * Falls back to the week's longest trading day when today is closed. "Nothing needs
   * reordering because we shut on Mondays" is not a useful answer for the person doing
   * Monday's ordering.
   */
  const hoursFor = (w: DaypartWindow) => (w.endMinutes - w.startMinutes) / 60;
  const totalHours = (ws: DaypartWindow[]) => ws.reduce((h, w) => h + hoursFor(w), 0);

  const serviceHours = (restaurant?.service_hours ?? {}) as never;
  let windows: DaypartWindow[] = windowsForDate(serviceHours, now, timeZone);
  if (windows.length === 0) {
    for (let d = 1; d <= 7; d++) {
      const other = new Date(now);
      other.setDate(other.getDate() + d);
      const candidate = windowsForDate(serviceHours, other, timeZone);
      if (totalHours(candidate) > totalHours(windows)) windows = candidate;
    }
  }

  // One DishUsage[] per window, built once rather than per ingredient.
  const perWindow: { hours: number; usage: DishUsage[] }[] = windows.map((w) => ({
    hours: hoursFor(w),
    usage: [...byDish.entries()].map(([dishId, recipe]) => ({
      recipe,
      unitsPerHour: rateFor.get(`${dishId}:${w.name}`) ?? 0,
    })),
  }));

  const rows: PantryRow[] = (ingredients ?? []).map((i) => {
    const supplier = one<{ name: string; lead_time_days: number }>(i.suppliers);
    const leadTimeDays = supplier?.lead_time_days ?? 1;
    const daily = perWindow.reduce(
      (sum, w) => sum + dailyUsage(i.id as string, w.usage, w.hours),
      0,
    );
    return {
      id: i.id as string,
      name: i.name as string,
      unit: i.unit as string,
      stockQty: Number(i.stock_qty),
      parLevel: Number(i.par_level),
      reorderPoint: Number(i.reorder_point),
      shelfLifeDays: (i.shelf_life_days as number | null) ?? null,
      leadTimeDays,
      supplierName: supplier?.name ?? null,
      costPerUnitCents: showCost ? (i.cost_per_unit_cents as number) : null,
      dailyUsageQty: daily,
      suggestion: suggestReorder(
        {
          id: i.id as string,
          stockQty: Number(i.stock_qty),
          parLevel: Number(i.par_level),
          shelfLifeDays: (i.shelf_life_days as number | null) ?? null,
          leadTimeDays,
        },
        daily,
      ),
    };
  });

  // Whatever needs attention first. A pantry list sorted alphabetically is a
  // reference document; sorted by urgency it's a worklist.
  rows.sort((a, b) => {
    if (a.suggestion.needsOrder !== b.suggestion.needsOrder) return a.suggestion.needsOrder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { rows, needsOrder: rows.filter((r) => r.suggestion.needsOrder).length, showCost };
}

/* ─────────────────────── menu costing / BOM view ─────────────────────── */

export interface BomLine {
  ingredientName: string;
  qty: number;
  unit: string;
  stockQty: number;
  /** Portions this one ingredient alone could support. */
  portionsFromThis: number;
  lineCostCents: number | null;
}

export interface MenuAdminRow {
  id: string;
  name: string;
  station: Station;
  priceCents: number;
  portions: number;
  unlimited: boolean;
  bom: BomLine[];
  foodCostCents: number | null;
  marginCents: number | null;
  marginPct: number | null;
  bindingIngredient: string | null;
}

export interface MenuAdminPayload {
  rows: MenuAdminRow[];
  showCost: boolean;
}

export async function getMenuAdmin(): Promise<MenuAdminPayload> {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile();
  const showCost = canSeeCost(profile?.role);

  const [{ data: dishes }, { data: recipes }, { data: availability }] = await Promise.all([
    supabase
      .from("dishes")
      .select("id, name, station, price_cents")
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("recipe_items")
      .select("dish_id, qty, ingredients ( name, unit, stock_qty, cost_per_unit_cents )"),
    supabase.from("dish_availability").select("dish_id, portions, unlimited"),
  ]);

  const availByDish = new Map(
    (availability ?? []).map((a) => [
      a.dish_id as string,
      { portions: a.portions as number, unlimited: Boolean(a.unlimited) },
    ]),
  );

  const bomByDish = new Map<string, BomLine[]>();
  for (const r of recipes ?? []) {
    const ing = one<{
      name: string;
      unit: string;
      stock_qty: number;
      cost_per_unit_cents: number;
    }>(r.ingredients);
    if (!ing) continue;
    const qty = Number(r.qty);
    const list = bomByDish.get(r.dish_id as string) ?? [];
    list.push({
      ingredientName: ing.name,
      qty,
      unit: ing.unit,
      stockQty: Number(ing.stock_qty),
      portionsFromThis: qty > 0 ? Math.floor(Number(ing.stock_qty) / qty) : 0,
      lineCostCents: showCost ? Math.round(qty * ing.cost_per_unit_cents) : null,
    });
    bomByDish.set(r.dish_id as string, list);
  }

  const rows: MenuAdminRow[] = (dishes ?? []).map((d) => {
    const bom = (bomByDish.get(d.id as string) ?? []).sort(
      (a, b) => a.portionsFromThis - b.portionsFromThis,
    );
    const avail = availByDish.get(d.id as string);
    const foodCost = showCost
      ? bom.reduce((sum, l) => sum + (l.lineCostCents ?? 0), 0)
      : null;
    const price = d.price_cents as number;
    return {
      id: d.id as string,
      name: d.name as string,
      station: d.station as Station,
      priceCents: price,
      portions: avail?.portions ?? 0,
      unlimited: avail?.unlimited ?? bom.length === 0,
      bom,
      foodCostCents: foodCost,
      marginCents: foodCost === null ? null : price - foodCost,
      marginPct: foodCost === null || price === 0 ? null : ((price - foodCost) / price) * 100,
      // The BOM is sorted by capacity, so the first line is what binds the dish.
      bindingIngredient: bom.length > 0 ? bom[0]!.ingredientName : null,
    };
  });

  return { rows, showCost };
}

/* ──────────────────────── reservations & queue ──────────────────────── */

export interface BookingRow {
  id: string;
  guestName: string;
  partySize: number;
  requestedAt: string;
  status: string;
  tableLabel: string | null;
}

export interface QueueRow {
  id: string;
  guestName: string;
  partySize: number;
  joinedAt: string;
  quotedMinutes: number | null;
  waitedMinutes: number;
  status: string;
}

export interface BookingsPayload {
  bookings: BookingRow[];
  queue: QueueRow[];
  coversBooked: number;
  /** Median seated→closed minutes by party-size bucket, from real history. */
  turnTimes: { bucket: string; medianMinutes: number | null; sample: number }[];
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "1–2", min: 1, max: 2 },
  { label: "3–4", min: 3, max: 4 },
  { label: "5–6", min: 5, max: 6 },
  { label: "7+", min: 7, max: 99 },
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

export async function getBookings(now: Date = new Date()): Promise<BookingsPayload> {
  const supabase = await createSupabaseServerClient();

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [{ data: reservations }, { data: queue }, { data: closed }] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, guest_name, party_size, requested_at, status, tables ( label )")
      .gte("requested_at", dayStart.toISOString())
      .lt("requested_at", dayEnd.toISOString())
      .order("requested_at"),
    supabase
      .from("queue_entries")
      .select("id, guest_name, party_size, joined_at, quoted_minutes, status")
      .in("status", ["waiting", "notified"])
      .order("joined_at"),
    // Turn times come from real seated→closed durations, joined to the table so a
    // party size can be inferred from seats when the booking wasn't linked.
    supabase
      .from("orders")
      .select("opened_at, closed_at, tables ( seats )")
      .eq("status", "paid")
      .not("closed_at", "is", null)
      .limit(1000),
  ]);

  const durationsByBucket = new Map<string, number[]>();
  for (const o of closed ?? []) {
    const seats = one<{ seats: number }>(o.tables)?.seats;
    if (!seats || !o.closed_at) continue;
    const mins =
      (new Date(o.closed_at as string).getTime() - new Date(o.opened_at as string).getTime()) /
      60_000;
    if (mins <= 0 || mins > 360) continue; // ignore obvious data noise
    const bucket = BUCKETS.find((b) => seats >= b.min && seats <= b.max);
    if (!bucket) continue;
    const list = durationsByBucket.get(bucket.label) ?? [];
    list.push(mins);
    durationsByBucket.set(bucket.label, list);
  }

  return {
    bookings: (reservations ?? []).map((r) => ({
      id: r.id as string,
      guestName: (r.guest_name as string) || "—",
      partySize: r.party_size as number,
      requestedAt: r.requested_at as string,
      status: r.status as string,
      tableLabel: one<{ label: string }>(r.tables)?.label ?? null,
    })),
    queue: (queue ?? []).map((q) => ({
      id: q.id as string,
      guestName: (q.guest_name as string) || "—",
      partySize: q.party_size as number,
      joinedAt: q.joined_at as string,
      quotedMinutes: (q.quoted_minutes as number | null) ?? null,
      waitedMinutes: Math.max(
        0,
        Math.floor((now.getTime() - new Date(q.joined_at as string).getTime()) / 60_000),
      ),
      status: q.status as string,
    })),
    coversBooked: (reservations ?? [])
      .filter((r) => r.status === "booked" || r.status === "seated")
      .reduce((n, r) => n + (r.party_size as number), 0),
    turnTimes: BUCKETS.map((b) => {
      const vals = durationsByBucket.get(b.label) ?? [];
      return {
        bucket: b.label,
        // Below ~10 samples this is not a measurement. The UI says so rather than
        // presenting a default as data-driven.
        medianMinutes: vals.length >= 10 ? Math.round(median(vals)!) : null,
        sample: vals.length,
      };
    }),
  };
}

/* ───────────────────────────── analytics ───────────────────────────── */

export interface ServiceSummary {
  covers: number;
  revenueCents: number;
  perCoverCents: number;
  avgTurnMinutes: number | null;
  foodCostPct: number | null;
  orders: number;
}

export interface AnalyticsPayload {
  summary: ServiceSummary;
  performance: (DishPerformance & { name: string; priceCents: number })[];
  windowDays: number;
  showCost: boolean;
  /** Fewer than this many orders and no trend should be drawn. */
  enoughData: boolean;
}

export async function getAnalytics(windowDays = 28, now: Date = new Date()): Promise<AnalyticsPayload> {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile();
  const showCost = canSeeCost(profile?.role);

  const from = new Date(now);
  from.setDate(from.getDate() - windowDays);

  // Both of these exceed 1000 rows over a 28-day window, so both are paged. See pageAll:
  // `.limit(5000)` and `.limit(20000)` returned 1000 rows each, silently.
  const [orders, items, { data: dishes }, { data: recipes }] = await Promise.all([
    pageAll<{
      id: string; opened_at: string; closed_at: string | null;
      total_cents: number; subtotal_cents: number; status: string;
      tables: { seats: number } | { seats: number }[] | null;
    }>(() =>
      supabase
        .from("orders")
        .select("id, opened_at, closed_at, total_cents, subtotal_cents, status, tables ( seats )",
          { count: "exact" })
        .gte("opened_at", from.toISOString())
        .order("opened_at"),
    ),
    pageAll<{ dish_id: string; qty: number; unit_price_cents: number; status: string }>(() =>
      supabase
        .from("order_items")
        .select("dish_id, qty, unit_price_cents, status, orders!inner ( opened_at )",
          { count: "exact" })
        .gte("orders.opened_at", from.toISOString())
        .neq("status", "voided")
        .order("dish_id"),
    ),
    supabase.from("dishes").select("id, name, price_cents").eq("is_archived", false),
    supabase
      .from("recipe_items")
      .select("dish_id, ingredient_id, qty, ingredients ( cost_per_unit_cents )"),
  ]);

  const paid = (orders ?? []).filter((o) => o.status === "paid");

  // subtotal_cents, NOT total_cents, for two reasons that both make the ratio below wrong:
  //   - total_cents is gross of 8% tax. Tax is not trading revenue, and putting it in the
  //     denominator of a food-cost percentage understates the percentage by that much.
  //   - the two writers of total_cents disagree about tips. pay_order() adds the tip
  //     (patch 003); the seed does not. So every order paid live during a demo books its
  //     tip as revenue while the seeded history does not — the same tile would change
  //     definition mid-demo.
  // Using the subtotal excludes tax and tips from both sides, so the figure is one thing
  // consistently. The tile is labelled "net revenue" to match.
  const revenueCents = paid.reduce((sum, o) => sum + ((o.subtotal_cents as number) ?? 0), 0);

  // This counts SEATS AT THE TABLES USED, not people. A four-top with two diners at it
  // counts four, and an order with no table (a QR-less walk-up) is assumed to be two.
  // Renaming the tile to "seats turned" rather than inventing a guest count: the honest
  // fix is a `covers` column set when a party is seated — patch 004's trigger is the hook
  // for it — and inventing one from furniture would be a worse number wearing a better
  // name. Tracked in docs/07-submission.md.
  const covers = paid.reduce((n, o) => n + (one<{ seats: number }>(o.tables)?.seats ?? 2), 0);

  const turns = paid
    .filter((o) => o.closed_at)
    .map(
      (o) =>
        (new Date(o.closed_at as string).getTime() - new Date(o.opened_at as string).getTime()) /
        60_000,
    )
    .filter((m) => m > 0 && m < 360);

  const soldByDish = new Map<string, number>();
  for (const it of items ?? []) {
    soldByDish.set(it.dish_id as string, (soldByDish.get(it.dish_id as string) ?? 0) + (it.qty as number));
  }

  // Cost per portion, from the BOM. Only computed when the caller may see cost.
  const costByDish = new Map<string, number>();
  if (showCost) {
    for (const r of recipes ?? []) {
      const ing = one<{ cost_per_unit_cents: number }>(r.ingredients);
      if (!ing) continue;
      costByDish.set(
        r.dish_id as string,
        (costByDish.get(r.dish_id as string) ?? 0) + Number(r.qty) * ing.cost_per_unit_cents,
      );
    }
  }

  const dishRows = (dishes ?? []).map((d) => ({
    dish: {
      id: d.id as string,
      priceCents: d.price_cents as number,
      recipe: [] as { ingredientId: string; qty: number }[],
    },
    unitsSold: soldByDish.get(d.id as string) ?? 0,
    costAtSaleCents: showCost ? Math.round(costByDish.get(d.id as string) ?? 0) : 0,
  }));

  const analysed = analyseMenu(dishRows, new Map<string, { costPerUnitCents: number }>());
  const nameById = new Map((dishes ?? []).map((d) => [d.id as string, d.name as string]));
  const priceById = new Map((dishes ?? []).map((d) => [d.id as string, d.price_cents as number]));

  const totalFoodCost = showCost
    ? [...soldByDish.entries()].reduce(
        (sum, [dishId, units]) => sum + units * (costByDish.get(dishId) ?? 0),
        0,
      )
    : 0;

  return {
    summary: {
      covers,
      revenueCents,
      perCoverCents: covers > 0 ? Math.round(revenueCents / covers) : 0,
      avgTurnMinutes: turns.length >= 10 ? Math.round(median(turns)!) : null,
      foodCostPct:
        showCost && revenueCents > 0 ? (totalFoodCost / revenueCents) * 100 : null,
      orders: paid.length,
    },
    performance: analysed
      .map((p) => ({
        ...p,
        name: nameById.get(p.dishId) ?? "—",
        priceCents: priceById.get(p.dishId) ?? 0,
      }))
      .sort((a, b) => b.popularity - a.popularity),
    windowDays,
    showCost,
    // A matrix drawn from a handful of orders is decoration, not analysis.
    enoughData: paid.length >= 30,
  };
}

/*
 * DONE, patch 003 — cost visibility is enforced at the database layer.
 *
 *   1. ingredients_read → is_manager()
 *   2. ingredients_public added, owner-rights, so non-manager staff keep stock counts
 *      without the cost columns
 *
 * Both asserted in scripts/sql-check.sh ("ingredients_read requires is_manager").
 *
 * Patch 006 then had to REVOKE writes on ingredients_public and every other view: an
 * owner-rights view is auto-updatable and Supabase grants write access on new views by
 * default, so (2) had quietly created a path for a chef to rewrite stock_qty with no
 * ledger row — the exact invariant (1) was protecting. Fixing a read leak with a view
 * opens a write leak unless the grants are dealt with in the same breath.
 */
