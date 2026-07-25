import { byUrgency, runwayFromPortions } from "@/lib/runway/runway";
import { scoreForSteering } from "@/lib/runway/steering";
import type { RunwayResult, Velocity } from "@/lib/runway/types";
import {
  currentDaypart,
  minutesFromMidnight,
  weekdayOf,
  type DaypartWindow,
} from "@/lib/runway/velocity";
import { resolveTimeZone } from "@/lib/runway/clock";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Guest-facing menu reads.
 *
 * Reads `menu_public`, never `dishes` joined to `ingredients` — that view exists
 * precisely so a guest payload cannot carry `cost_per_unit_cents`. Runway is then
 * computed in TypeScript by the same tested engine the ops surfaces use, via
 * `runwayFromPortions`.
 */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The lunch/dinner split must match the seed's velocity aggregation exactly. */
const DINNER_FROM_HOUR = 16;

export interface MenuDish {
  id: string;
  categoryId: string | null;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  station: string;
  prepMinutes: number;
  tags: string[];
  allergens: string[];
  sort: number;
  /** Carried through rather than inferred from band: "off because the sauce broke"
      and "off because stock ran out" need different actions. */
  manually86: boolean;
  runway: RunwayResult;
}

export interface MenuCategory {
  id: string;
  name: string;
  sort: number;
}

export interface MenuPayload {
  restaurantId: string;
  restaurantName: string;
  /** Ordered by urgency: soonest to run out first. */
  dishes: MenuDish[];
  categories: MenuCategory[];
  serviceOpen: boolean;
  daypart: string | null;
  /**
   * Passed to the client so it can recompute runway with the SAME engine when a
   * portion count changes over realtime, rather than reimplementing the rules or
   * round-tripping to the server for the maths.
   */
  velocityByDish: Record<string, Velocity>;
  serviceWindows: DaypartWindow[];
  /** The restaurant's IANA zone — every clock decision downstream must use it. */
  timeZone: string;
}

interface ServiceHours {
  [day: string]: [string, string][];
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Service windows for a given date, from the restaurant's stored hours.
 *
 * `timeZone` decides WHICH DAY's hours apply. Getting this wrong is not a cosmetic
 * hour-offset bug: either side of local midnight the wrong zone selects a different
 * weekday, so the engine compares "now" against the wrong day's windows entirely.
 */
export function windowsForDate(
  hours: ServiceHours,
  date: Date,
  timeZone?: string,
): DaypartWindow[] {
  const spans = hours[DAY_KEYS[weekdayOf(date, timeZone)]!] ?? [];
  return spans.map(([start, end], i) => ({
    name: i === 0 && toMinutes(start!) < DINNER_FROM_HOUR * 60 ? "lunch" : "dinner",
    startMinutes: toMinutes(start!),
    endMinutes: toMinutes(end!),
  }));
}

/** Which velocity bucket applies now, in the restaurant's own clock. */
export function daypartKey(date: Date, timeZone?: string): string {
  return minutesFromMidnight(date, timeZone) < DINNER_FROM_HOUR * 60 ? "lunch" : "dinner";
}

export async function getMenuWithRunway(now: Date = new Date()): Promise<MenuPayload> {
  const supabase = await createSupabaseServerClient();

  // Single-tenant demo: one restaurant. Multi-tenant is in the schema, so this is
  // the only place that would take a slug instead.
  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .select("id, name, timezone, service_hours")
    .limit(1)
    .single();

  if (rErr || !restaurant) {
    throw new Error(`menu: no restaurant (${rErr?.message ?? "empty"})`);
  }

  const timeZone = resolveTimeZone(restaurant.timezone as string | null);
  const windows = windowsForDate((restaurant.service_hours ?? {}) as ServiceHours, now, timeZone);
  const serviceOpen = currentDaypart(now, windows, timeZone) !== null;
  const daypart = daypartKey(now, timeZone);

  const [{ data: rows, error: mErr }, { data: vRows }, { data: cats }] = await Promise.all([
    supabase
      .from("menu_public")
      .select(
        "id, category_id, name, description, price_cents, image_url, station, prep_minutes, tags, allergens, sort, portions, manually_86, unlimited",
      )
      .eq("restaurant_id", restaurant.id)
      .order("sort"),
    supabase
      .from("dish_velocity")
      .select("dish_id, ewma_units_per_hour, sample_count")
      .eq("weekday", weekdayOf(now, timeZone))
      .eq("daypart", daypart),
    supabase
      .from("menu_categories")
      .select("id, name, sort")
      .eq("restaurant_id", restaurant.id)
      .order("sort"),
  ]);

  if (mErr) throw new Error(`menu: ${mErr.message}`);

  const velocityByDish = new Map<string, Velocity>(
    (vRows ?? []).map((v) => [
      v.dish_id as string,
      {
        unitsPerHour: Number(v.ewma_units_per_hour),
        sampleCount: v.sample_count as number,
      },
    ]),
  );

  // Fallback for a dish with too little history of its own. Never 0 — a zero rate
  // makes runway infinite, which would silently delete the feature.
  const rates = [...velocityByDish.values()].map((v) => v.unitsPerHour).filter((r) => r > 0);
  const globalMeanVelocity = rates.length
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : 0;

  const dishes: MenuDish[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    categoryId: (row.category_id as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string) ?? "",
    priceCents: row.price_cents as number,
    imageUrl: (row.image_url as string | null) ?? null,
    station: row.station as string,
    prepMinutes: row.prep_minutes as number,
    tags: (row.tags as string[]) ?? [],
    allergens: (row.allergens as string[]) ?? [],
    sort: (row.sort as number) ?? 0,
    manually86: Boolean(row.manually_86),
    runway: runwayFromPortions({
      dishId: row.id as string,
      portions: row.portions as number,
      manually86: Boolean(row.manually_86),
      velocity: velocityByDish.get(row.id as string),
      globalMeanVelocity,
      serviceWindows: windows,
      now,
      timeZone,
    }),
  }));

  dishes.sort((a, b) => byUrgency(a.runway, b.runway));

  return {
    restaurantId: restaurant.id as string,
    restaurantName: restaurant.name as string,
    dishes,
    categories: (cats ?? []) as MenuCategory[],
    serviceOpen,
    daypart: serviceOpen ? daypart : null,
    velocityByDish: Object.fromEntries(velocityByDish),
    serviceWindows: windows,
    timeZone,
  };
}

/**
 * One dish, plus the ingredient NAMES that go into it.
 *
 * Names only — never `recipe_items.qty` and never cost. The quantities are the
 * recipe, and the recipe is the restaurant's; the names are useful transparency for
 * someone deciding what to eat.
 */
export async function getDishDetail(
  dishId: string,
  now: Date = new Date(),
): Promise<{ dish: MenuDish; ingredientNames: string[] } | null> {
  const menu = await getMenuWithRunway(now);
  const dish = menu.dishes.find((d) => d.id === dishId);
  if (!dish) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("recipe_items")
    .select("ingredients ( name )")
    .eq("dish_id", dishId);

  const ingredientNames = (data ?? [])
    .map((row) => {
      const rel = row.ingredients as { name: string } | { name: string }[] | null;
      if (rel == null) return null;
      return Array.isArray(rel) ? (rel[0]?.name ?? null) : rel.name;
    })
    .filter((n): n is string => Boolean(n));

  return { dish, ingredientNames };
}

/**
 * Ordering for the guest browse rail.
 *
 * NOTE ON A DELIBERATE DEVIATION FROM docs/05-runway-engine.md §6.
 * The full steer_score weights margin at 0.30 — but margin needs
 * `cost_per_unit_cents`, and a guest legitimately cannot read that (it is the one
 * thing `menu_public` exists to keep out of guest payloads). Three options:
 *
 *   1. Reimplement steer_score in SQL inside the view, exposing only the rank.
 *      Rejected for the same reason as the runway maths: a second, untested
 *      implementation that will drift.
 *   2. Use a privileged client in app code to read cost. Rejected outright —
 *      ADR-3 puts authorization in the database, and the service role key never
 *      appears in app code.
 *   3. Drop the margin term on the guest path only.
 *
 * Chose 3. `scoreForSteering` is passed marginCents: 0 for every dish, which makes
 * `normalise` return a constant 0.5 for all of them — so the margin term cancels
 * out and ordering falls to runway, scarcity and affinity. That is the entire
 * guest-VISIBLE behaviour: near-86 dishes sink and get badged. The margin lever is
 * a manager concern and surfaces on the ops side, where cost is legitimately
 * readable. No SQL twin, no leaked cost, and the tested function is reused as-is.
 */
export function orderForGuest(dishes: readonly MenuDish[]): MenuDish[] {
  const scored = scoreForSteering(
    dishes.map((d) => ({
      dishId: d.id,
      marginCents: 0,
      runway: d.runway,
      affinity: 0,
    })),
  );
  const rank = new Map(scored.map((s, i) => [s.dishId, i]));
  return [...dishes].sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
  );
}
