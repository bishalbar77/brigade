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
import { resolveTimeZone, zonedParts } from "../lib/runway/clock";
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

function windowsFor(date: Date, timeZone: string): DaypartWindow[] {
  const key = DAYS[zonedParts(date, timeZone).weekday]!;
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

  // In the RESTAURANT's zone, not this laptop's. Reading the weekday and the hour off the
  // local clock made this script disagree with the product it was checking: run from a
  // London machine against a Kolkata restaurant it loaded the wrong day's sell rates and
  // called an open service closed. Same bug class as the one fixed in the engine itself.
  const restaurants = await q<{ timezone: string | null }>(
    "restaurants?select=timezone&limit=1", secret!);
  const timeZone = resolveTimeZone(restaurants[0]?.timezone);
  const here = zonedParts(now, timeZone);
  const windows = windowsFor(now, timeZone);
  const weekday = here.weekday;
  const daypart = here.minutes < 16 * 60 ? "lunch" : "dinner";
  const serviceOpen = windows.some(
    (w) => here.minutes >= w.startMinutes && here.minutes < w.endMinutes,
  );
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
    ` · now ${here.hhmm} ${timeZone} · daypart ${daypart} · ` +
    (serviceOpen ? "OPEN" : "closed right now"));

  const urgent = results
    .filter((x) => x.r.band === "critical" || x.r.band === "out" || x.r.band === "low")
    .sort((a, b) => a.r.portions - b.r.portions)
    .slice(0, 6);

  for (const { name, r } of urgent) {
    /*
     * Mirror what the BOARD says, not the raw field.
     *
     * This line printed `86s ~12:25` for the prawns: 3 portions at 0.15/hr is twenty hours
     * out, so the timestamp is tomorrow lunchtime and an HH:MM label makes it read as
     * today. The product never shows that — RunwayMeter checks lastsThroughService first
     * and says "enough for tonight" — but this is the diagnostic someone reads before a
     * demo, and a diagnostic that contradicts the screen is worse than no diagnostic.
     *
     * Also uses the engine's own zoned label rather than getHours(), which is the server's
     * timezone and was a second way for this line to disagree with the board.
     */
    const eta = r.lastsThroughService
      ? "enough for tonight"
      : r.predicted86At && r.predicted86Label
      ? `86s ~${r.predicted86Label}`
      : open ? "no prediction" : "service closed — portions only";
    console.log(`  ${r.band.toUpperCase().padEnd(8)} ${String(r.portions).padStart(3)} left  ${name.padEnd(34)} ${eta}` +
      (r.bindingIngredientId ? `  ← ${ingName.get(r.bindingIngredientId)}` : ""));
  }

  /*
   * Split in two, because the single check this replaces was quietly time-dependent: it
   * asserted the engine finds "at-risk" dishes, and a dish is only banded low or critical
   * from a PREDICTION, which the engine correctly refuses to make outside service hours.
   * So the same database passed at 20:00 and failed at 03:00, and the failure said
   * "engine identifies at-risk dishes: 0" as though the engine were broken.
   *
   * A check that depends on when you run it is worse than no check, because you learn to
   * ignore it. So: scarcity is asserted always (it is a fact about the pantry), and the
   * banding is asserted only while service is open, where a band is meaningful.
   */
  const scarceByEngine = results.filter((x) => !x.r.unlimited && x.r.portions <= 12);
  check(scarceByEngine.length > 0, "the pantry has genuinely scarce dishes",
    `${scarceByEngine.length} at 12 portions or fewer — the board has something to count down`);

  /*
   * Assert the RULES, not an outcome.
   *
   * This used to say "service is open, therefore some dish is banded low or critical", and
   * it failed on data that was entirely correct. A band is a threshold on remaining MINUTES
   * (critical under 45, low under 120) — so a dish with few portions and a slow sell rate is
   * legitimately `plenty`. Scarcity in portions is not scarcity in time, and the assertion
   * confused the two.
   *
   * What is always true, and is what the engine actually promises:
   */
  const forcedCritical = results.filter((x) => !x.r.unlimited && x.r.portions > 0 && x.r.portions <= 3);
  check(forcedCritical.every((x) => x.r.band === "critical"),
    "3 portions or fewer is always critical, whatever the sell rate",
    `${forcedCritical.length} at or under 3 portions`);

  const predictable = results.filter(
    (x) => !x.r.unlimited && !x.r.insufficientHistory && x.r.portions > 0);
  if (serviceOpen) {
    check(predictable.every((x) => x.r.runwayMinutes !== null),
      "every stocked dish with history gets a prediction while service is open",
      `${predictable.length} dishes`);
    /*
     * The differentiator itself — but only where it is POSSIBLE.
     *
     * This asserted flatly that something must be forecast to run out tonight, and failed
     * at 22:46 with service closing at 23:00. With twelve minutes left nothing can 86
     * before closing, so the engine was right and the assertion was demanding an outcome
     * the clock had made unreachable.
     *
     * Fourth time this session I have written a check that only passes at certain hours.
     * The pattern is always the same: asserting a RESULT that depends on when you run it,
     * instead of the RULE that holds whenever you run it. So both are here now — the rule
     * unconditionally, and the result only when the remaining service window is long
     * enough for any dish to run out inside it.
     */
    const serviceEnd = Math.max(...windows.map((w) => w.endMinutes));
    const minutesLeft = serviceEnd - here.minutes;
    const soonest = Math.min(
      ...results
        .filter((x) => x.r.runwayMinutes !== null)
        .map((x) => x.r.runwayMinutes as number),
    );

    // The rule: lastsThroughService must agree with the arithmetic, every time. This is
    // the invariant the runway board was violating when it grouped by band.
    const consistent = results.filter((x) => x.r.runwayMinutes !== null).every(
      (x) => x.r.lastsThroughService === (here.minutes + (x.r.runwayMinutes as number) > serviceEnd),
    );
    check(consistent, "'lasts through service' always agrees with now + runway vs closing",
      `${minutesLeft} min of service left, soonest runway ${Number.isFinite(soonest) ? Math.round(soonest) : "n/a"} min`);

    const tonight = results.filter((x) => x.r.predicted86At !== null && !x.r.lastsThroughService);
    if (Number.isFinite(soonest) && soonest < minutesLeft) {
      check(tonight.length > 0, "the dishes that will run out tonight are forecast",
        tonight.map((x) => `${x.name} ${x.r.predicted86Label}`).slice(0, 3).join(", "));
    } else {
      console.log(`  ─ no countdown expected: ${minutesLeft} min of service left and the ` +
        `soonest dish needs ${Number.isFinite(soonest) ? Math.round(soonest) : "?"} min`);
    }
  } else {
    check(predictable.every((x) => x.r.runwayMinutes === null),
      "no dish is given a prediction while the kitchen is shut",
      "velocity is meaningless outside service, so the engine suppresses it");
  }
  void urgent;
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
