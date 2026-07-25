import { byUrgency, runwayFromPortions } from "@/lib/runway/runway";
import type { RunwayResult, Velocity } from "@/lib/runway/types";
import { currentDaypart, type DaypartWindow } from "@/lib/runway/velocity";
import { createSupabaseServerClient, getCurrentProfile } from "@/lib/supabase/server";
import { daypartKey, windowsForDate } from "@/lib/data/menu";
import {
  type Docket,
  type RunwayRow,
  type ItemStatus,
  type Station,
} from "@/lib/ops/tickets";


/**
 * Ops-side reads: the docket wall and the runway board.
 *
 * Every query runs with the staff member's own session, so RLS decides what comes
 * back. Nothing here uses a privileged client (ADR-3).
 */

/**
 * PostgREST embeds a to-one relationship as an object, but supabase-js types it as
 * an array. Normalise rather than casting, so a genuinely empty relation returns
 * null instead of reading `.name` off undefined at runtime.
 */
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export interface KdsPayload {
  restaurantId: string;
  /** null = expo / manager view: every station. */
  station: Station | null;
  role: string;
  dockets: Docket[];
  serviceOpen: boolean;
}

/** Dockets for the open service, oldest first so the longest-waiting ticket leads. */
export async function getKdsData(station: Station | null = null): Promise<KdsPayload> {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, service_hours")
    .limit(1)
    .single();

  if (!restaurant) throw new Error("kds: no restaurant");

  const now = new Date();
  const windows = windowsForDate((restaurant.service_hours ?? {}) as never, now);

  const { data: rows, error } = await supabase
    .from("orders")
    .select(
      `id, opened_at, status,
       tables ( label ),
       order_items ( id, qty, status, station, notes, dishes ( name ) )`,
    )
    .eq("restaurant_id", restaurant.id)
    .eq("status", "open")
    .order("opened_at", { ascending: true });

  if (error) throw new Error(`kds: ${error.message}`);

  const dockets: Docket[] = (rows ?? [])
    .map((order) => {
      const items = (order.order_items ?? [])
        .map((it) => ({
          id: it.id as string,
          dishName: one<{ name: string }>(it.dishes)?.name ?? "—",
          qty: it.qty as number,
          status: it.status as ItemStatus,
          station: it.station as Station,
          notes: (it.notes as string | null) ?? null,
        }))
        // A finished or voided item leaves the board. Completed dockets must clear,
        // or an 8-hour service grows an unbounded DOM.
        .filter((it) => it.status !== "served" && it.status !== "voided")
        .filter((it) => (station ? it.station === station : true));

      return {
        orderId: order.id as string,
        tableLabel: one<{ label: string }>(order.tables)?.label ?? "—",
        openedAt: order.opened_at as string,
        items,
      };
    })
    .filter((d) => d.items.length > 0);

  return {
    restaurantId: restaurant.id as string,
    station,
    role: profile?.role ?? "guest",
    dockets,
    serviceOpen: currentDaypart(now, windows) !== null,
  };
}

export interface RunwayBoardPayload {
  restaurantId: string;
  rows: RunwayRow[];
  serviceOpen: boolean;
  daypart: string | null;
  velocityByDish: Record<string, Velocity>;
  serviceWindows: DaypartWindow[];
}

/**
 * The runway board. Ordered soonest-to-86 first — by predicted TIME, not by band,
 * because band and urgency are different things (see byUrgency).
 *
 * Carries the binding ingredient, which is the actionable half: "branzino 86s at
 * 20:40" is information, "because you have four lemons" is something a chef can do
 * something about in the next five minutes.
 */
export async function getRunwayBoard(): Promise<RunwayBoardPayload> {
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, service_hours")
    .limit(1)
    .single();

  if (!restaurant) throw new Error("runway: no restaurant");

  const now = new Date();
  const windows = windowsForDate((restaurant.service_hours ?? {}) as never, now);
  const serviceOpen = currentDaypart(now, windows) !== null;
  const daypart = daypartKey(now);

  const [{ data: dishes }, { data: vRows }, { data: binding }] = await Promise.all([
    supabase
      .from("menu_public")
      .select("id, name, station, price_cents, portions, manually_86, unlimited")
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("dish_velocity")
      .select("dish_id, ewma_units_per_hour, sample_count")
      .eq("weekday", now.getDay())
      .eq("daypart", daypart),
    supabase
      .from("dish_binding_ingredient")
      .select("dish_id, ingredient_id, ingredient_name, stock_qty"),
  ]);

  const velocityByDish = new Map<string, Velocity>(
    (vRows ?? []).map((v) => [
      v.dish_id as string,
      { unitsPerHour: Number(v.ewma_units_per_hour), sampleCount: v.sample_count as number },
    ]),
  );

  const bindingByDish = new Map(
    (binding ?? []).map((b) => [
      b.dish_id as string,
      {
        id: b.ingredient_id as string,
        name: b.ingredient_name as string,
        stock: Number(b.stock_qty),
      },
    ]),
  );

  const rates = [...velocityByDish.values()].map((v) => v.unitsPerHour).filter((r) => r > 0);
  const globalMeanVelocity = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  const rows: RunwayRow[] = (dishes ?? []).map((d) => {
    const dishId = d.id as string;
    const vel = velocityByDish.get(dishId);
    const bind = bindingByDish.get(dishId);
    return {
      dishId,
      name: d.name as string,
      station: d.station as Station,
      priceCents: d.price_cents as number,
      runway: runwayFromPortions({
        dishId,
        portions: d.portions as number,
        manually86: Boolean(d.manually_86),
        velocity: vel,
        globalMeanVelocity,
        serviceWindows: windows,
        now,
        bindingIngredientId: bind?.id ?? null,
      }),
      bindingIngredientId: bind?.id ?? null,
      bindingIngredientName: bind?.name ?? null,
      bindingStockQty: bind?.stock ?? null,
      unitsPerHour: vel?.unitsPerHour ?? 0,
      sampleCount: vel?.sampleCount ?? 0,
    };
  });

  rows.sort((a, b) => byUrgency(a.runway, b.runway));

  return {
    restaurantId: restaurant.id as string,
    rows,
    serviceOpen,
    daypart: serviceOpen ? daypart : null,
    velocityByDish: Object.fromEntries(velocityByDish),
    serviceWindows: windows,
  };
}

/* Re-exported for server-side callers. CLIENT components must import from
 * "@/lib/ops/tickets" directly — importing from here drags next/headers into the
 * browser bundle, which silently breaks the whole App Router. */
export {
  STATIONS,
  STATION_LABEL,
  NEXT_STATUS,
  STATUS_ACTION,
  STATUS_LABEL,
  ticketAgeMinutes,
  ageLevel,
} from "@/lib/ops/tickets";
export type { ItemStatus, Station, Docket, DocketItem, RunwayRow } from "@/lib/ops/tickets";
