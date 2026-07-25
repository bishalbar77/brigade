import { zonedClock } from "./clock";
import { bindingIngredient, isManually86, isUnlimited, portionsAvailable } from "./availability";
import {
  type DaypartWindow,
  currentDaypart,
  minutesFromMidnight,
  resolveVelocity,
  serviceEndMinutes,
} from "./velocity";
import {
  BAND_THRESHOLDS,
  type Dish,
  type RunwayBand,
  type RunwayResult,
  type Velocity,
} from "./types";

/**
 * The core metric: minutes until a dish 86s at tonight's actual sell rate.
 *
 *   runway_minutes = portions / velocity_per_hour * 60
 *
 * See docs/05-runway-engine.md §3.
 */
export function runwayMinutes(portions: number, unitsPerHour: number): number | null {
  if (isUnlimited(portions)) return null;
  if (unitsPerHour <= 0) return null; // undefined, not infinite
  return (portions / unitsPerHour) * 60;
}

/**
 * Which band a dish is in. Drives every runway UI affordance.
 *
 * `portions <= 3` forces critical regardless of rate: at low absolute counts the
 * ratio is noisy, and "3 left" matters to a guest whatever the sell rate says.
 */
export function bandFor(portions: number, minutes: number | null): RunwayBand {
  if (portions <= 0) return "out";
  if (portions <= BAND_THRESHOLDS.criticalPortions) return "critical";
  if (minutes === null) return "plenty"; // unlimited, or rate unknown
  if (minutes < BAND_THRESHOLDS.criticalMinutes) return "critical";
  if (minutes < BAND_THRESHOLDS.lowMinutes) return "low";
  return "plenty";
}

export interface RunwayInput {
  dish: Dish;
  stockByIngredient: ReadonlyMap<string, number>;
  velocity?: Velocity;
  categoryMeanVelocity?: number;
  globalMeanVelocity?: number;
  serviceWindows: readonly DaypartWindow[];
  now?: Date;
}

export interface PortionsRunwayInput {
  dishId: string;
  /** May be the UNLIMITED sentinel, matching the dish_availability view. */
  portions: number;
  manually86?: boolean;
  velocity?: Velocity;
  categoryMeanVelocity?: number;
  globalMeanVelocity?: number;
  serviceWindows: readonly DaypartWindow[];
  now?: Date;
  bindingIngredientId?: string | null;
  /**
   * The restaurant's IANA zone. Omit ONLY in tests, where the ambient zone is the
   * intended frame. In production this must be `restaurants.timezone`, or every clock
   * decision silently answers in the server's zone — which on Vercel is UTC.
   */
  timeZone?: string;
}

/**
 * Runway from a portion count that has already been computed.
 *
 * Exists because guest surfaces read `menu_public`, which carries `portions` but
 * deliberately exposes no ingredient stock — so they cannot recompute portions
 * from a bill of materials the way `computeRunway` does. Both paths funnel
 * through this one function, so there is exactly ONE implementation of the
 * banding, suppression and cold-start rules. The alternative — reimplementing
 * them in SQL for the guest — is two implementations that will drift.
 */
export function runwayFromPortions(input: PortionsRunwayInput): RunwayResult {
  const {
    dishId,
    portions: rawPortions,
    manually86 = false,
    velocity,
    categoryMeanVelocity,
    globalMeanVelocity = 0,
    serviceWindows,
    now = new Date(),
    bindingIngredientId = null,
    timeZone,
  } = input;

  const unlimited = isUnlimited(rawPortions);

  // A manual 86 (burnt sauce, fryer down) zeroes availability regardless of stock.
  const portions = manually86 ? 0 : rawPortions;

  // Every clock decision below is in the RESTAURANT's zone when one is given.
  const serviceOpen = currentDaypart(now, serviceWindows, timeZone) !== null;
  const { unitsPerHour, insufficientHistory } = resolveVelocity(
    velocity,
    categoryMeanVelocity,
    globalMeanVelocity,
  );

  // Suppress the prediction when the kitchen is closed or history is too thin.
  const minutes =
    serviceOpen && !insufficientHistory ? runwayMinutes(portions, unitsPerHour) : null;

  // Does it outlast the night? A prediction past closing is arithmetically correct
  // and useless: nobody needs telling the croquettes would run out at 02:19.
  // Both sides of this comparison must be in the SAME frame. Evaluating "now" in the
  // server zone against window minutes that describe the restaurant's local clock is
  // how a post-close 86 time became reachable in production.
  const endMinutes = serviceEndMinutes(serviceWindows);
  const lastsThroughService =
    minutes !== null && endMinutes !== null
      ? minutesFromMidnight(now, timeZone) + minutes > endMinutes
      : false;

  const predicted86At = minutes === null ? null : new Date(now.getTime() + minutes * 60_000);

  return {
    dishId,
    portions: unlimited && !manually86 ? rawPortions : portions,
    runwayMinutes: minutes,
    predicted86At,
    // Formatted here, in the restaurant's zone, so no client re-derives it in its own.
    predicted86Label:
      predicted86At === null
        ? null
        : timeZone
          ? zonedClock(predicted86At, timeZone)
          : `${String(predicted86At.getHours()).padStart(2, "0")}:${String(
              predicted86At.getMinutes(),
            ).padStart(2, "0")}`,
    band: bandFor(portions, minutes),
    unlimited: unlimited && !manually86,
    insufficientHistory: insufficientHistory && serviceOpen,
    lastsThroughService,
    bindingIngredientId,
  };
}

/**
 * Full runway calculation for one dish.
 *
 * Deliberate behaviours worth knowing:
 *  - outside service hours: portions only, no prediction (velocity is meaningless)
 *  - fewer than 3 velocity samples: `insufficientHistory`, so the UI can say
 *    "not enough history" instead of fabricating a time
 *  - manual 86 overrides computed availability but stays distinguishable from it
 */
export function computeRunway(input: RunwayInput): RunwayResult {
  const { dish, stockByIngredient, now = new Date() } = input;

  return runwayFromPortions({
    dishId: dish.id,
    portions: portionsAvailable(dish.recipe, stockByIngredient),
    manually86: isManually86(dish, now),
    velocity: input.velocity,
    categoryMeanVelocity: input.categoryMeanVelocity,
    globalMeanVelocity: input.globalMeanVelocity,
    serviceWindows: input.serviceWindows,
    now,
    bindingIngredientId: bindingIngredient(dish.recipe, stockByIngredient),
  });
}

/**
 * Sort for the runway board: soonest to 86 first.
 *
 * Sorts by PREDICTED TIME, not by band. Band and urgency are different things, and
 * conflating them mis-orders the board — which real seeded data made obvious:
 *
 *   scallops  3 portions, 86s in 173 min  → critical (forced by portions <= 3)
 *   sea bass  4 portions, 86s in 100 min  → low
 *
 * Ranking by band put the scallops on top, burying the dish that actually runs out
 * 73 minutes sooner. The band is a scarcity signal worth showing a guest ("3 left");
 * it is not a claim about what the kitchen should deal with first.
 *
 * Tiers: already out → has a prediction (soonest first) → no prediction (fewest
 * portions first) → unlimited.
 */
export function byUrgency(a: RunwayResult, b: RunwayResult): number {
  const tier = (r: RunwayResult): number => {
    if (r.portions <= 0) return 0;            // already 86'd — the kitchen must know
    if (r.runwayMinutes !== null) return 1;   // predicted
    if (!r.unlimited) return 2;               // finite but unpredictable (closed / thin history)
    return 3;                                 // unlimited
  };

  const ta = tier(a);
  const tb = tier(b);
  if (ta !== tb) return ta - tb;

  if (ta === 1) return a.runwayMinutes! - b.runwayMinutes!;
  return a.portions - b.portions;
}
