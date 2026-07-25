import { byUrgency, runwayFromPortions } from "@/lib/runway/runway";
import type { RunwayResult, Velocity } from "@/lib/runway/types";
import { currentDaypart, type DaypartWindow } from "@/lib/runway/velocity";
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
}

interface ServiceHours {
  [day: string]: [string, string][];
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Service windows for a given date, from the restaurant's stored hours. */
export function windowsForDate(hours: ServiceHours, date: Date): DaypartWindow[] {
  const spans = hours[DAY_KEYS[date.getDay()]!] ?? [];
  return spans.map(([start, end], i) => ({
    name: i === 0 && toMinutes(start!) < DINNER_FROM_HOUR * 60 ? "lunch" : "dinner",
    startMinutes: toMinutes(start!),
    endMinutes: toMinutes(end!),
  }));
}

export function daypartKey(date: Date): string {
  return date.getHours() < DINNER_FROM_HOUR ? "lunch" : "dinner";
}

export async function getMenuWithRunway(now: Date = new Date()): Promise<MenuPayload> {
  const supabase = await createSupabaseServerClient();

  // Single-tenant demo: one restaurant. Multi-tenant is in the schema, so this is
  // the only place that would take a slug instead.
  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .select("id, name, service_hours")
    .limit(1)
    .single();

  if (rErr || !restaurant) {
    throw new Error(`menu: no restaurant (${rErr?.message ?? "empty"})`);
  }

  const windows = windowsForDate((restaurant.service_hours ?? {}) as ServiceHours, now);
  const serviceOpen = currentDaypart(now, windows) !== null;
  const daypart = daypartKey(now);

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
      .eq("weekday", now.getDay())
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
    runway: runwayFromPortions({
      dishId: row.id as string,
      portions: row.portions as number,
      manually86: Boolean(row.manually_86),
      velocity: velocityByDish.get(row.id as string),
      globalMeanVelocity,
      serviceWindows: windows,
      now,
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
  };
}
