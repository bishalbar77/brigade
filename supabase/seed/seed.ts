/**
 * Seed six weeks of plausible service history.
 *
 * This is NOT optional scaffolding. The whole Platinum layer is statistical: EWMA
 * velocity over an empty table forecasts nothing, and analytics built on three days
 * of hackathon data looks broken to a judge. Everything the runway board, the
 * forecast, and the menu-engineering matrix show comes from what this script writes.
 *
 * Idempotent: wipes and rebuilds the demo restaurant. Uses the service-role key,
 * which bypasses RLS — that is why it runs as a script and never as app code.
 *
 *   npm run seed
 */
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import {
  CATEGORIES, COVERS_BY_WEEKDAY, DEMO_PASSWORD, DISHES, GUESTS, INGREDIENTS,
  SERVICE_HOURS, STAFF, SUPPLIERS, TABLES, type SeedDish,
} from "./data";

const WEEKS_OF_HISTORY = 6;
const RESTAURANT_SLUG = "brigade-demo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Copy .env.example to .env.local and fill both from the Supabase dashboard.",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false },
  // supabase-js constructs a RealtimeClient in its constructor, and native
  // WebSocket only exists from Node 22. This script never opens a channel, but the
  // client is built regardless — so hand it a transport rather than require Node 22.
  realtime: { transport: ws as never },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Auth admin calls: raw fetch, with retry on one specific server-side flake.
 *
 * Measured on this project: an `sb_secret_` key is rejected on ~30% of requests to
 * /auth/v1/admin/* with 403 `bad_jwt` ("unrecognized JWT kid <nil> for algorithm
 * ES256"), and accepted on the rest — same key, same request, same process. That is
 * inconsistent key handling across GoTrue instances behind the load balancer, not
 * anything we control.
 *
 * Two notes on scope:
 *  - The PUBLISHABLE key was measured at 0/10 rejections on user-facing auth
 *    (sign-in, signup, OTP), so this affects seeding only — never the live app.
 *  - A legacy `service_role` JWT (eyJ...) is HS256 and verified consistently by
 *    every instance, so it avoids this entirely. See docs/08-runbook.md.
 *
 * Retry is deliberately narrow: only on bad_jwt. Genuine errors (validation,
 * duplicate email) must still fail fast rather than be retried 6 times.
 */
async function authAdmin<T>(path: string, init?: RequestInit, attempts = 6): Promise<T> {
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(`${url}/auth/v1/admin${path}`, {
      ...init,
      headers: {
        apikey: serviceKey!,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();

    if (res.ok) return (text ? JSON.parse(text) : null) as T;

    last = `${res.status}: ${text.slice(0, 160)}`;
    if (text.includes("bad_jwt") && attempt < attempts) {
      await sleep(120 * attempt);
      continue;
    }
    throw new Error(`auth ${path} → ${last}`);
  }
  throw new Error(`auth ${path} → gave up after ${attempts} attempts. Last: ${last}`);
}

interface AuthUser {
  id: string;
  email?: string;
}

const listUsers = () =>
  authAdmin<{ users: AuthUser[] }>("/users?per_page=200").then((r) => r.users ?? []);

const createUser = (email: string, password: string, fullName: string) =>
  authAdmin<AuthUser>("/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      // pre-confirmed so place_order()'s verified-email check passes for demo logins
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });

/**
 * Reuse an existing demo user, or create one.
 *
 * Deliberately never DELETEs. On this project an `sb_secret_` key is accepted for
 * GET and POST on /auth/v1/admin/users but returns 403 bad_jwt on DELETE — user
 * deletion appears to want a legacy service_role JWT. Reusing identities is both
 * the lower-privilege path and the more sensible one: a user is a stable identity,
 * and all the domain data is cleared by the restaurant cascade anyway.
 */
async function ensureUser(
  email: string,
  fullName: string,
  existing: ReadonlyMap<string, string>,
): Promise<string> {
  const found = existing.get(email);
  if (found) return found;

  try {
    const created = await createUser(email, DEMO_PASSWORD, fullName);
    if (!created?.id) throw new Error(`user ${email}: no id returned`);
    return created.id;
  } catch (err) {
    // Belt and braces: if the address already exists (a earlier partial run, or a
    // create that succeeded with a lost response), adopt it rather than failing.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already|exists|registered/i.test(msg)) throw err;
    const again = (await listUsers()).find((u) => u.email === email);
    if (!again) throw err;
    return again.id;
  }
}

// ---------------------------------------------------------------- utilities

/** Seeded PRNG so a reseed produces the same history — reproducible demos. */
let seed = 20260725;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function jitter(value: number, pct: number): number {
  return value * (1 + (rand() * 2 - 1) * pct);
}

/** Pick a dish by relative sales weight, so popularity is genuinely uneven. */
function weightedPick(dishes: SeedDish[], totalWeight: number): SeedDish {
  let r = rand() * totalWeight;
  for (const d of dishes) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return dishes[dishes.length - 1]!;
}

async function chunkInsert(table: string, rows: unknown[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).insert(rows.slice(i, i + size) as never);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

// ------------------------------------------------------------------- reset

async function reset(): Promise<void> {
  const { data: existing } = await db
    .from("restaurants").select("id").eq("slug", RESTAURANT_SLUG).maybeSingle();

  if (existing) {
    // Deleting the restaurant does NOT cascade cleanly on its own. Two FKs are
    // ON DELETE RESTRICT by design — recipe_items.ingredient_id and
    // order_items.dish_id — so when the restaurant cascade reaches ingredients or
    // dishes before it reaches their dependents, the restrict fires and the whole
    // delete is refused. Postgres doesn't guarantee cascade ordering between
    // sibling paths, which is why this looked intermittent.
    //
    // So clear the restricting children explicitly, in dependency order, first.
    // (The constraints are also being changed to NO ACTION DEFERRABLE — see
    // supabase/patches/001_fk_deferrable.sql — after which this becomes belt and
    // braces rather than load-bearing.)
    const { error: ordersErr } = await db
      .from("orders").delete().eq("restaurant_id", existing.id);
    if (ordersErr) throw new Error(`reset orders: ${ordersErr.message}`);

    const { data: dishRows } = await db
      .from("dishes").select("id").eq("restaurant_id", existing.id);
    const dishIds = (dishRows ?? []).map((d) => d.id);
    if (dishIds.length) {
      const { error: recipeErr } = await db
        .from("recipe_items").delete().in("dish_id", dishIds);
      if (recipeErr) throw new Error(`reset recipe_items: ${recipeErr.message}`);
    }

    const { error: delErr } = await db.from("restaurants").delete().eq("id", existing.id);
    if (delErr) throw new Error(`reset restaurant: ${delErr.message}`);

    // Verify rather than trust: a silently-failed delete here is what produced a
    // confusing "duplicate key on slug" three steps later.
    const { data: stillThere } = await db
      .from("restaurants").select("id").eq("slug", RESTAURANT_SLUG).maybeSingle();
    if (stillThere) throw new Error("reset: restaurant still present after delete");

    console.log("  cleared previous demo restaurant");
  }

  // Auth users are intentionally NOT deleted — see ensureUser(). Deleting the
  // restaurant already nulled their restaurant_id via ON DELETE SET NULL, and the
  // role/station assignment below sets them correctly again.
}

// ------------------------------------------------------------------- main

async function main(): Promise<void> {
  console.log("Seeding Brigade demo data…\n");
  await reset();

  // ---- restaurant
  const { data: restaurant, error: rErr } = await db
    .from("restaurants")
    .insert({
      // tax_rate is 5% because that is GST on restaurant service in India (the 5%,
      // no-input-tax-credit rate), not a round number picked to look plausible. It is
      // stored per restaurant precisely so it is a fact about the tenant rather than a
      // constant in the code.
      //
      // Asia/Kolkata is load-bearing, not cosmetic: every runway prediction, every
      // service window and the whole lunch/dinner velocity split are resolved in the
      // restaurant's own zone. Leaving it in London would put every predicted 86 time
      // five and a half hours out.
      name: "Brigade", slug: RESTAURANT_SLUG, timezone: "Asia/Kolkata",
      currency: "INR", tax_rate: 0.05, service_hours: SERVICE_HOURS, covers: 60,
    })
    .select("id").single();
  if (rErr || !restaurant) throw new Error(`restaurant: ${rErr?.message}`);
  const restaurantId = restaurant.id;
  console.log("  restaurant");

  // ---- users: reuse if they already exist, create if not
  const existingByEmail = new Map(
    (await listUsers()).filter((u) => u.email).map((u) => [u.email!, u.id] as const),
  );
  const userIds = new Map<string, string>();
  let created = 0;
  for (const person of [...STAFF, ...GUESTS]) {
    const before = existingByEmail.has(person.email);
    userIds.set(person.email, await ensureUser(person.email, person.name, existingByEmail));
    if (!before) created++;
  }

  // The handle_new_user trigger created each profile as a guest; assign real roles.
  for (const s of STAFF) {
    const { error } = await db.from("profiles").update({
      restaurant_id: restaurantId, role: s.role, station: s.station, full_name: s.name,
    }).eq("id", userIds.get(s.email)!);
    if (error) throw new Error(`profile ${s.email}: ${error.message}`);
  }
  for (const g of GUESTS) {
    await db.from("profiles").update({ full_name: g.name, allergens: g.allergens })
      .eq("id", userIds.get(g.email)!);
  }
  console.log(
    `  ${STAFF.length} staff + ${GUESTS.length} guests ` +
      `(${created} created, ${STAFF.length + GUESTS.length - created} reused)`,
  );

  // ---- suppliers
  const { data: suppliers } = await db.from("suppliers").insert(
    SUPPLIERS.map((s) => ({
      restaurant_id: restaurantId, name: s.name, contact: s.contact, lead_time_days: s.leadTimeDays,
    })),
  ).select("id, name");
  const supplierIds = new Map((suppliers ?? []).map((s) => [s.name, s.id]));

  // ---- ingredients. Start at 0; every unit of stock arrives via the ledger, so
  // stock_qty stays a true projection of stock_movements from the very first row.
  const { data: ingredients } = await db.from("ingredients").insert(
    INGREDIENTS.map((i) => ({
      restaurant_id: restaurantId, name: i.name, unit: i.unit, stock_qty: 0,
      par_level: i.parLevel, reorder_point: Math.round(i.parLevel * 0.3 * 100) / 100,
      cost_per_unit_cents: i.costPerUnitCents, supplier_id: supplierIds.get(i.supplier) ?? null,
      shelf_life_days: i.shelfLifeDays,
    })),
  ).select("id, name");
  const ingredientIds = new Map((ingredients ?? []).map((i) => [i.name, i.id]));
  console.log(`  ${INGREDIENTS.length} ingredients, ${SUPPLIERS.length} suppliers`);

  // ---- categories & dishes
  const { data: categories } = await db.from("menu_categories").insert(
    CATEGORIES.map((name, idx) => ({ restaurant_id: restaurantId, name, sort: idx })),
  ).select("id, name");
  const categoryIds = new Map((categories ?? []).map((c) => [c.name, c.id]));

  const { data: dishes } = await db.from("dishes").insert(
    DISHES.map((d, idx) => ({
      restaurant_id: restaurantId, category_id: categoryIds.get(d.category) ?? null,
      name: d.name, description: d.description, price_cents: d.priceCents,
      station: d.station, prep_minutes: d.prepMinutes, tags: d.tags, allergens: d.allergens,
      sort: idx,
    })),
  ).select("id, name, price_cents, station");
  const dishIds = new Map((dishes ?? []).map((d) => [d.name, d.id]));

  await chunkInsert("recipe_items", DISHES.flatMap((d) =>
    d.recipe.map((r) => ({
      dish_id: dishIds.get(d.name)!, ingredient_id: ingredientIds.get(r.ingredient)!, qty: r.qty,
    })),
  ));
  console.log(`  ${DISHES.length} dishes with bills of materials`);

  // ---- tables
  await chunkInsert("tables", TABLES.map((t) => ({
    restaurant_id: restaurantId, label: t.label, seats: t.seats, zone: t.zone, status: "open",
  })));

  // ------------------------------------------------------------------
  // Six weeks of service history.
  //
  // Orders and items are written directly (not through place_order) because we're
  // fabricating the past. Stock movements are written alongside so the ledger stays
  // consistent with what was "sold", which is what makes waste variance meaningful.
  // ------------------------------------------------------------------
  const totalWeight = DISHES.reduce((s, d) => s + d.weight, 0);
  const guestIds = GUESTS.map((g) => userIds.get(g.email)!);
  const serverId = userIds.get("server@brigade.test")!;

  const { data: tableRows } = await db.from("tables").select("id, seats").eq("restaurant_id", restaurantId);
  const tableList = tableRows ?? [];

  const orders: Record<string, unknown>[] = [];
  const itemsByOrder: { orderId: string; dish: SeedDish; qty: number; firedAt: Date; price: number }[] = [];
  const consumption = new Map<string, number>();  // ingredient -> total consumed

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let daysAgo = WEEKS_OF_HISTORY * 7; daysAgo >= 1; daysAgo--) {
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);
    const weekday = day.getDay();

    // covers for the day, with a little week-to-week noise
    const covers = Math.max(8, Math.round(jitter(COVERS_BY_WEEKDAY[weekday]!, 0.18)));
    // Dinner carries most covers. Sunday skews to lunch (the roast) but still runs an
    // early evening service — it needs (sunday, dinner) velocity rows, and 26 July is
    // a demo day.
    const services: { startHour: number; share: number }[] =
      weekday === 0
        ? [{ startHour: 12, share: 0.62 }, { startHour: 17, share: 0.38 }]
        : [{ startHour: 12, share: 0.35 }, { startHour: 18, share: 0.65 }];

    for (const service of services) {
      const serviceCovers = Math.round(covers * service.share);
      // parties of 2–4 mostly
      let seated = 0;
      while (seated < serviceCovers) {
        const partySize = randInt(1, 4) === 4 ? randInt(4, 6) : randInt(1, 3);
        seated += partySize;

        const table = tableList[randInt(0, tableList.length - 1)]!;
        const openedAt = new Date(day);
        // arrivals cluster mid-service rather than spreading flat
        const offset = Math.round((rand() + rand()) / 2 * 210);
        openedAt.setHours(service.startHour, offset, 0, 0);

        const turnMinutes = 55 + partySize * 8 + randInt(-10, 25);
        const closedAt = new Date(openedAt.getTime() + turnMinutes * 60_000);

        const orderId = crypto.randomUUID();
        // one dish per cover, plus a drink for most people
        const lineCount = partySize + (rand() < 0.75 ? partySize : 0);
        let subtotal = 0;

        for (let n = 0; n < lineCount; n++) {
          const dish = weightedPick(DISHES, totalWeight);
          const qty = 1;
          const firedAt = new Date(openedAt.getTime() + randInt(4, 18) * 60_000);
          itemsByOrder.push({ orderId, dish, qty, firedAt, price: dish.priceCents });
          subtotal += dish.priceCents * qty;

          for (const line of dish.recipe) {
            const key = ingredientIds.get(line.ingredient)!;
            consumption.set(key, (consumption.get(key) ?? 0) + line.qty * qty);
          }
        }

        const tax = Math.round(subtotal * 0.08);
        orders.push({
          id: orderId, restaurant_id: restaurantId, table_id: table.id,
          guest_id: guestIds[randInt(0, guestIds.length - 1)]!, server_id: serverId,
          status: "paid", opened_at: openedAt.toISOString(), closed_at: closedAt.toISOString(),
          subtotal_cents: subtotal, tax_cents: tax,
          tip_cents: rand() < 0.6 ? Math.round(subtotal * 0.1) : 0,
          total_cents: subtotal + tax,
        });
      }
    }
  }

  await chunkInsert("orders", orders);
  console.log(`  ${orders.length} historical orders across ${WEEKS_OF_HISTORY} weeks`);

  await chunkInsert("order_items", itemsByOrder.map((i) => ({
    order_id: i.orderId, dish_id: dishIds.get(i.dish.name)!, qty: i.qty,
    unit_price_cents: i.price, status: "served", station: i.dish.station,
    fired_at: i.firedAt.toISOString(),
    plated_at: new Date(i.firedAt.getTime() + i.dish.prepMinutes * 60_000).toISOString(),
    served_at: new Date(i.firedAt.getTime() + (i.dish.prepMinutes + 2) * 60_000).toISOString(),
    created_at: i.firedAt.toISOString(),
  })));
  await chunkInsert("payments", orders.map((o) => ({
    order_id: o.id as string, method: "card",
    amount_cents: (o.total_cents as number) + (o.tip_cents as number), status: "succeeded",
  })));
  console.log(`  ${itemsByOrder.length} order items + payments`);

  // ------------------------------------------------------------------
  // Stock ledger. Purchases cover historical consumption plus today's opening
  // stock, so stock_qty ends up exactly where we want it for the demo.
  // ------------------------------------------------------------------
  const movements: Record<string, unknown>[] = [];
  const managerId = userIds.get("manager@brigade.test")!;

  // Dishes we want visibly near-86 on camera. The runway board needs something
  // to count down on, and the demo script depends on it (docs/07-submission.md).
  /*
   * Dishes deliberately left near-86, so the runway board has something to count
   * down and the demo has something to point at.
   *
   * Exactly ONE ingredient per dish is set to the target. Everything else in that
   * recipe must stay comfortably above it.
   *
   * This matters more than it looks. `portions = min(over ingredients)`, so if two
   * ingredients tie at the binding count, topping up either one moves nothing —
   * the other still caps the dish. That is `min()` behaving correctly, but on a
   * demo it reads as a broken write path: a manager adds stock and the number sits
   * there. It also makes `dish_binding_ingredient` arbitrary between the tied rows,
   * which undermines the "because you have 3 scallops" line that makes the runway
   * board actionable.
   */
  const NEAR_86: Record<string, number> = {
    /*
     * A COUNTDOWN NEEDS A FAST SELLER, not just a low count.
     *
     * The first version of this list pinned only the prawns and the goat — the three
     * dearest things on the menu, and therefore the three that barely sell. Measured
     * against real seeded velocity at 16:00 with seven hours of service left:
     *
     *   tandoori prawns   4 portions @ 0.15/hr → 1621 min
     *   rogan josh        7 portions @ 0.41/hr → 1031 min
     *   butter chicken   64 portions @ 1.74/hr → 2206 min
     *
     * Nothing ran out before closing, so the board correctly said "enough for tonight"
     * for all 28 dishes and the signature screen had nothing to count down. The engine
     * was right and the DATA was wrong: runway is portions ÷ rate, and I had made the
     * scarce dishes the slow ones. Scarcity in portions is not scarcity in time.
     *
     * So the constraint now sits on the busiest dish on the menu. Chicken thigh binds
     * butter chicken (1.74/hr, the highest weight here) at 6 portions and murgh malai
     * tikka at 5 — roughly 3.5 hours, which lands a predicted 86 in the middle of dinner
     * service where a demo can point at it. It is also the more honest story: the thing
     * you run out of is the thing everyone is ordering.
     */
    "Chicken thigh, boneless": 1.3,
    /*
     * The prawns stay pinned, one portion lower, for a different job: at 3 portions
     * `bandFor` forces critical regardless of sell rate (portions <= 3), so there is a red
     * row on the board at ANY hour — including outside service, when predictions are
     * correctly suppressed and every time-based band falls back to plenty. One row that
     * cannot go quiet is worth having on the screen the whole product is judged on.
     *
     * 0.55kg: tandoori prawns use 0.18/portion → 3 left; kadai prawns 0.16 → 3 as well.
     * One ingredient capping TWO dishes is deliberate — order a tandoori prawn and the
     * kadai countdown moves too, which is the per-ingredient demand aggregation in
     * place_order() made visible on screen.
     */
    "Tiger prawns": 0.55,
    // 2.2kg of goat. Rogan josh takes 0.28/portion → 7; the biryani takes 0.25 → 8. The
    // same shortage, two different numbers, because the recipes are different — which is
    // the whole argument for computing availability from the BOM instead of storing a flag.
    "Goat leg, bone-in": 2.2,
    // Comfortable but finite, so the board has a middle band and not just two red rows.
    "Goat mince": 2.4,        // → seekh kebab 12 left
    //
    // Every OTHER ingredient in those four recipes is left to the normal par-level fill,
    // and each was checked to land in the hundreds of portions. That check is the point of
    // this list: `portions = min(over ingredients)`, so if two ingredients TIE at the
    // binding count, topping up either one moves nothing — the other still caps the dish.
    // That is min() behaving correctly, but on a demo it reads as a broken write path: a
    // manager adds stock and the number sits there. It also makes dish_binding_ingredient
    // arbitrary between the tied rows, which undermines the "because you have 0.75kg of
    // prawns" line that makes the board actionable rather than merely alarming.
  };

  for (const ing of INGREDIENTS) {
    const id = ingredientIds.get(ing.name)!;
    const consumed = consumption.get(id) ?? 0;
    const closing = NEAR_86[ing.name] ?? jitter(ing.parLevel * 0.75, 0.25);

    // one purchase per week, sized to cover that week's usage
    const weeklyPurchase = (consumed / WEEKS_OF_HISTORY) * 1.08;
    for (let w = WEEKS_OF_HISTORY; w >= 1; w--) {
      const at = new Date(today);
      at.setDate(at.getDate() - w * 7);
      at.setHours(8, 15, 0, 0);
      movements.push({
        ingredient_id: id, delta: Math.round(weeklyPurchase * 1000) / 1000,
        reason: "purchase", actor_id: managerId, created_at: at.toISOString(),
        note: `weekly delivery — ${ing.supplier}`,
      });
    }

    // the depletion side of everything sold
    if (consumed > 0) {
      movements.push({
        ingredient_id: id, delta: -Math.round(consumed * 1000) / 1000,
        reason: "depletion", actor_id: null,
        created_at: new Date(today.getTime() - 86_400_000).toISOString(),
        note: "aggregated historical depletion",
      });
    }

    // A little waste on perishables, so variance analysis has real signal.
    if (ing.shelfLifeDays !== null && ing.shelfLifeDays <= 7 && rand() < 0.7) {
      const at = new Date(today);
      at.setDate(at.getDate() - randInt(2, 20));
      movements.push({
        ingredient_id: id, delta: -Math.round(consumed * 0.03 * 1000) / 1000,
        reason: "waste", actor_id: userIds.get("grill@brigade.test")!,
        created_at: at.toISOString(), note: "end of service — past its best",
      });
    }

    // Final correction lands stock exactly on the intended opening figure.
    const runningTotal = movements
      .filter((m) => m.ingredient_id === id)
      .reduce((s, m) => s + (m.delta as number), 0);
    const adjust = Math.round((closing - runningTotal) * 1000) / 1000;
    if (Math.abs(adjust) > 0.0005) {
      movements.push({
        ingredient_id: id, delta: adjust, reason: "purchase", actor_id: managerId,
        created_at: new Date(today.getTime() + 8 * 3_600_000).toISOString(),
        note: "opening stock for today's service",
      });
    }
  }

  await chunkInsert("stock_movements", movements);
  console.log(`  ${movements.length} stock movements (append-only ledger)`);

  // Project the ledger onto ingredients.stock_qty — the ONLY place this is done
  // outside place_order()/adjust_stock(). Must match the reconciliation query in
  // docs/08-runbook.md exactly, or every downstream number is wrong.
  for (const ing of INGREDIENTS) {
    const id = ingredientIds.get(ing.name)!;
    const total = movements
      .filter((m) => m.ingredient_id === id)
      .reduce((s, m) => s + (m.delta as number), 0);
    const { error } = await db.from("ingredients")
      .update({ stock_qty: Math.round(total * 1000) / 1000 }).eq("id", id);
    if (error) throw new Error(`project stock ${ing.name}: ${error.message}`);
  }
  console.log("  projected stock_qty from the ledger");

  // ---- velocity: EWMA per (dish, weekday, daypart) from the history above
  const velocityRows: Record<string, unknown>[] = [];
  for (const dish of DISHES) {
    const dishId = dishIds.get(dish.name)!;
    for (let weekday = 0; weekday < 7; weekday++) {
      for (const daypart of ["lunch", "dinner"]) {
        const sold = itemsByOrder.filter((i) => {
          if (i.dish.name !== dish.name) return false;
          if (i.firedAt.getDay() !== weekday) return false;
          const h = i.firedAt.getHours();
          return daypart === "lunch" ? h < 16 : h >= 16;
        });
        const occurrences = Math.max(1, WEEKS_OF_HISTORY);
        const hours = daypart === "lunch" ? 3 : 4.5;
        const perHour = sold.length / occurrences / hours;
        velocityRows.push({
          dish_id: dishId, weekday, daypart,
          ewma_units_per_hour: Math.round(perHour * 10000) / 10000,
          sample_count: occurrences,
        });
      }
    }
  }
  await chunkInsert("dish_velocity", velocityRows);
  console.log(`  ${velocityRows.length} velocity rows`);

  // ---- today: a live service in progress, so the KDS isn't empty on open
  const openOrders: Record<string, unknown>[] = [];
  const openItems: Record<string, unknown>[] = [];
  const now = new Date();
  const liveTables = tableList.slice(0, 3);

  for (const [idx, table] of liveTables.entries()) {
    const orderId = crypto.randomUUID();
    const openedAt = new Date(now.getTime() - (12 + idx * 9) * 60_000);
    let subtotal = 0;
    const statuses = ["placed", "fired", "cooking"] as const;

    for (let n = 0; n < 2 + idx; n++) {
      const dish = weightedPick(DISHES, totalWeight);
      subtotal += dish.priceCents;
      openItems.push({
        order_id: orderId, dish_id: dishIds.get(dish.name)!, qty: 1,
        unit_price_cents: dish.priceCents, status: statuses[Math.min(n, 2)]!,
        station: dish.station, created_at: openedAt.toISOString(),
      });
    }

    const tax = Math.round(subtotal * 0.08);
    openOrders.push({
      id: orderId, restaurant_id: restaurantId, table_id: table.id,
      guest_id: guestIds[idx % guestIds.length]!, server_id: serverId, status: "open",
      opened_at: openedAt.toISOString(), subtotal_cents: subtotal, tax_cents: tax,
      total_cents: subtotal + tax,
    });
  }
  await chunkInsert("orders", openOrders);
  await chunkInsert("order_items", openItems);

  // ---- normalise the floor, LAST and deliberately.
  //
  // Six weeks of historical orders each carry a table_id, and patch 004 added a trigger
  // that seats a table whenever an order is attached to it. Correct in service, wrong
  // here: replaying history seated all twelve tables and nothing released them, because
  // pay_order() — which is what sets 'dirty' — never runs for rows inserted directly.
  // The floor map then showed a permanently full restaurant, and verify:features could
  // not find an open table to order at.
  //
  // So the seed states the floor explicitly once the history is in, rather than letting
  // it fall out of the replay: open by default, seated where there is a live order, and
  // one table left dirty so the bussing state is visible on the screen rather than only
  // in the enum.
  await db.from("tables").update({ status: "open" }).eq("restaurant_id", restaurantId);
  for (const table of liveTables) {
    await db.from("tables").update({ status: "seated" }).eq("id", table.id);
  }
  const dirtyTable = tableList[3];
  if (dirtyTable) {
    await db.from("tables").update({ status: "dirty" }).eq("id", dirtyTable.id);
  }

  // a waiting queue so the host screen has something in it
  await chunkInsert("queue_entries", [
    { restaurant_id: restaurantId, guest_name: "Walk-in", party_size: 2,
      quoted_minutes: 25, status: "waiting",
      joined_at: new Date(now.getTime() - 24 * 60_000).toISOString() },
    { restaurant_id: restaurantId, guest_name: "Walk-in", party_size: 4,
      quoted_minutes: 40, status: "waiting",
      joined_at: new Date(now.getTime() - 18 * 60_000).toISOString() },
  ]);

  // A book of upcoming reservations.
  //
  // This was missing entirely until npm run verify:features asked the host's screen to
  // prove it had something on it: the reservations table was EMPTY, so /ops/reservations
  // — a Silver user-story screen — demoed as a blank page, and every booking slot on
  // /reserve showed free because nothing was ever taken. Booking worked; there was just
  // nothing to look at, which is indistinguishable from broken to anyone watching.
  //
  // Deliberately uneven: tonight is busy from 19:00, tomorrow's lunch is quiet, and
  // Saturday evening is nearly full. A book with one booking an hour looks generated,
  // and greyed-out slots on /reserve only mean something if some hours are fuller than
  // others.
  const bookings: Record<string, unknown>[] = [];
  const bookingShape: [number, number, number[]][] = [
    // [days ahead, first hour, party sizes]
    [0, 19, [2, 2, 4, 2, 6, 4, 2]],
    [1, 12, [2, 4]],
    [1, 19, [2, 4, 2, 8]],
    [2, 19, [4, 2, 2, 6, 2, 4, 2, 2]],
    [3, 13, [2, 2, 4]],
  ];
  for (const [daysAhead, firstHour, parties] of bookingShape) {
    parties.forEach((partySize, i) => {
      const at = new Date(now);
      at.setDate(at.getDate() + daysAhead);
      at.setHours(firstHour + Math.floor(i / 2), (i % 2) * 30, 0, 0);
      if (at.getTime() < now.getTime() + 30 * 60_000) return; // never seed the past
      const guest = GUESTS[i % GUESTS.length]!;
      bookings.push({
        restaurant_id: restaurantId,
        // Most of the book is walk-up phone bookings with no account behind them, which
        // is how a real book looks. A few belong to the demo guests so a signed-in diner
        // has a booking of their own to see.
        guest_id: i % 3 === 0 ? userIds.get(guest.email)! : null,
        guest_name: i % 3 === 0 ? guest.name : ["Achebe", "Nakamura", "Okafor", "Lindqvist", "Batra"][i % 5]!,
        party_size: partySize,
        requested_at: at.toISOString(),
        source: i % 4 === 0 ? "phone" : "web",
        status: "booked",
      });
    });
  }
  await chunkInsert("reservations", bookings);

  console.log(`  ${openOrders.length} live orders + queue + ${bookings.length} bookings\n`);

  // ---- summary
  const { data: avail } = await db.from("dish_availability").select("dish_id, portions")
    .eq("restaurant_id", restaurantId);
  const scarce = (avail ?? []).filter((a) => a.portions <= 10).length;

  console.log("Done.");
  console.log(`  logins: ${[...STAFF, ...GUESTS].map((p) => p.email).join(", ")}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  ${scarce} dishes are near-86 — the runway board has something to count down.\n`);
}

main().catch((err: unknown) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
