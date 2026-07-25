/**
 * Verifies seeded data against the invariants everything downstream depends on,
 * then runs the real runway engine over it.
 *
 * Run after every reseed, and before the demo:
 *   npm run verify:data
 *
 * Checks, in order of how badly a failure would hurt:
 *   1. ledger vs projection — if stock_movements and ingredients.stock_qty disagree,
 *      every number in the product is wrong (ADR-5)
 *   2. no negative stock
 *   3. availability has scarce dishes — the runway board needs something to count down
 *   4. velocity is non-zero with enough samples, or the forecast silently vanishes
 *   5. no cost/margin field reachable with the publishable key
 *   6. the runway engine produces sane predictions on real data
 */
import { computeRunway } from "../lib/runway/runway";
import type { Dish, Velocity } from "../lib/runway/types";
import type { DaypartWindow } from "../lib/runway/velocity";
import { SERVICE_HOURS } from "../supabase/seed/data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !secret || !publishable) {
  console.error("Missing env. Expected NEXT_PUBLIC_SUPABASE_URL, ANON_KEY and SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function q<T>(path: string, key: string): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 160)}`);
  return JSON.parse(text) as T[];
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function windowsFor(date: Date): DaypartWindow[] {
  const key = DAYS[date.getDay()]!;
  const spans = (SERVICE_HOURS as Record<string, string[][]>)[key] ?? [];
  return spans.map((span, i) => {
    const toMin = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return h! * 60 + m!;
    };
    return {
      name: i === 0 && toMin(span[0]!) < 16 * 60 ? "lunch" : "dinner",
      startMinutes: toMin(span[0]!),
      endMinutes: toMin(span[1]!),
    };
  });
}

async function main() {
  const now = new Date();
  console.log(`\nBrigade data verification — ${now.toISOString()}\n`);

  // ---- 1 & 2: the ledger invariant
  console.log("Stock ledger (ADR-5):");
  const ingredients = await q<{ id: string; name: string; stock_qty: string; cost_per_unit_cents: number }>(
    "ingredients?select=id,name,stock_qty,cost_per_unit_cents&limit=500", secret!);
  const movements = await q<{ ingredient_id: string; delta: string }>(
    "stock_movements?select=ingredient_id,delta&limit=5000", secret!);

  const ledger = new Map<string, number>();
  for (const m of movements) {
    ledger.set(m.ingredient_id, (ledger.get(m.ingredient_id) ?? 0) + Number(m.delta));
  }
  const drifted = ingredients.filter(
    (i) => Math.abs((ledger.get(i.id) ?? 0) - Number(i.stock_qty)) > 0.0005);
  const negative = ingredients.filter((i) => Number(i.stock_qty) < 0);

  check(drifted.length === 0, "ledger equals projection",
    `${ingredients.length} ingredients, ${movements.length} movements` +
    (drifted.length ? ` — DRIFTED: ${drifted.map((d) => d.name).join(", ")}` : ""));
  check(negative.length === 0, "no negative stock",
    negative.length ? negative.map((n) => n.name).join(", ") : "");

  // ---- 3: availability
  console.log("\nAvailability:");
  const availability = await q<{ dish_id: string; portions: number; unlimited: boolean; manually_86: boolean }>(
    "dish_availability?select=dish_id,portions,unlimited,manually_86&limit=200", secret!);
  const scarce = availability.filter((a) => !a.unlimited && a.portions <= 12);
  check(availability.length > 0, "dish_availability returns rows", `${availability.length} dishes`);
  check(scarce.length > 0, "at least one dish is near-86", `${scarce.length} scarce — the board has something to count down`);

  // ---- 4: velocity
  console.log("\nVelocity:");
  const velocity = await q<{ dish_id: string; weekday: number; daypart: string; ewma_units_per_hour: string; sample_count: number }>(
    "dish_velocity?select=dish_id,weekday,daypart,ewma_units_per_hour,sample_count&limit=1000", secret!);
  const nonZero = velocity.filter((v) => Number(v.ewma_units_per_hour) > 0);
  const enoughSamples = velocity.filter((v) => v.sample_count >= 3);
  check(nonZero.length > 0, "velocity is non-zero", `${nonZero.length}/${velocity.length} rows`);
  check(enoughSamples.length === velocity.length, "every row has >= 3 samples",
    "fewer would flag insufficientHistory and suppress predictions");

  // ---- 5: no cost leak on the guest surface
  console.log("\nGuest surface (publishable key):");
  const menu = await q<Record<string, unknown>>("menu_public?select=*&limit=1", publishable!);
  const leaked = menu[0] ? Object.keys(menu[0]).filter((k) => /cost|margin/i.test(k)) : [];
  check(menu.length > 0, "menu_public is readable by a guest");
  check(leaked.length === 0, "no cost or margin field exposed", leaked.join(", "));

  const denied = await q<unknown>("ingredients?select=id&limit=1", publishable!);
  check(denied.length === 0, "ingredients denied to anonymous by RLS", `${denied.length} rows returned`);

  // ---- 6: the runway engine on real data
  console.log("\nRunway engine on real data:");
  const dishRows = await q<{ id: string; name: string; price_cents: number; manual_86_until: string | null }>(
    "dishes?select=id,name,price_cents,manual_86_until&is_archived=eq.false&limit=200", secret!);
  const recipes = await q<{ dish_id: string; ingredient_id: string; qty: string }>(
    "recipe_items?select=dish_id,ingredient_id,qty&limit=2000", secret!);

  const stock = new Map(ingredients.map((i) => [i.id, Number(i.stock_qty)]));
  const ingName = new Map(ingredients.map((i) => [i.id, i.name]));
  const recipeByDish = new Map<string, { ingredientId: string; qty: number }[]>();
  for (const r of recipes) {
    const list = recipeByDish.get(r.dish_id) ?? [];
    list.push({ ingredientId: r.ingredient_id, qty: Number(r.qty) });
    recipeByDish.set(r.dish_id, list);
  }

  const windows = windowsFor(now);
  const weekday = now.getDay();
  const daypart = now.getHours() < 16 ? "lunch" : "dinner";
  const velByDish = new Map<string, Velocity>();
  for (const v of velocity) {
    if (v.weekday === weekday && v.daypart === daypart) {
      velByDish.set(v.dish_id, {
        unitsPerHour: Number(v.ewma_units_per_hour),
        sampleCount: v.sample_count,
      });
    }
  }

  const results = dishRows.map((d) => {
    const dish: Dish = {
      id: d.id, name: d.name, priceCents: d.price_cents,
      recipe: recipeByDish.get(d.id) ?? [],
      manual86Until: d.manual_86_until ? new Date(d.manual_86_until) : null,
    };
    return { name: d.name, r: computeRunway({
      dish, stockByIngredient: stock, velocity: velByDish.get(d.id),
      globalMeanVelocity: 1, serviceWindows: windows, now,
    }) };
  });

  const open = windows.length > 0 && results.some((x) => x.r.runwayMinutes !== null);
  console.log(`  service windows today (${DAYS[weekday]}): ` +
    (windows.length ? windows.map((w) => w.name).join(", ") : "closed") +
    ` · now ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")} · daypart ${daypart}`);

  const urgent = results
    .filter((x) => x.r.band === "critical" || x.r.band === "out" || x.r.band === "low")
    .sort((a, b) => a.r.portions - b.r.portions)
    .slice(0, 6);

  for (const { name, r } of urgent) {
    const eta = r.predicted86At
      ? `86s ~${String(r.predicted86At.getHours()).padStart(2, "0")}:${String(r.predicted86At.getMinutes()).padStart(2, "0")}`
      : open ? "no prediction" : "service closed — portions only";
    console.log(`  ${r.band.toUpperCase().padEnd(8)} ${String(r.portions).padStart(3)} left  ${name.padEnd(34)} ${eta}` +
      (r.bindingIngredientId ? `  ← ${ingName.get(r.bindingIngredientId)}` : ""));
  }

  check(urgent.length > 0, "engine identifies at-risk dishes", `${urgent.length} in low/critical/out`);
  check(results.every((x) => !x.r.unlimited || x.r.runwayMinutes === null),
    "unlimited dishes never get a finite runway");
  check(results.every((x) => x.r.portions >= 0), "no negative portions");

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} CHECK(S) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("\nVerification error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
