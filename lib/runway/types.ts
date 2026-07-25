/**
 * Shared types for the runway engine.
 *
 * Everything in lib/runway/ is a pure function with no Supabase imports, so the
 * maths can be unit-tested without a database. This is the part most worth testing
 * and the part most likely to be subtly wrong. See docs/05-runway-engine.md.
 */

export type RunwayBand = "plenty" | "low" | "critical" | "out";

/** Sentinel for a dish with no bill of materials. Matches the SQL view's coalesce. */
export const UNLIMITED = 2147483647;

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  parLevel: number;
  costPerUnitCents: number;
  shelfLifeDays: number | null;
  leadTimeDays: number;
}

/** One line of a bill of materials: qty of an ingredient per single portion. */
export interface RecipeItem {
  ingredientId: string;
  qty: number;
}

export interface Dish {
  id: string;
  name: string;
  priceCents: number;
  recipe: RecipeItem[];
  manual86Until?: Date | null;
}

/** Velocity for one (dish, weekday, daypart) slot. */
export interface Velocity {
  unitsPerHour: number;
  sampleCount: number;
}

export interface RunwayResult {
  dishId: string;
  portions: number;
  /** null when velocity is unknown or service is closed — never a fabricated number. */
  runwayMinutes: number | null;
  predicted86At: Date | null;
  band: RunwayBand;
  unlimited: boolean;
  /** true when we lack the history to predict. UI must say so rather than guess. */
  insufficientHistory: boolean;
  /**
   * The dish outlasts tonight's service.
   *
   * Without this the UI renders a mathematically-correct but absurd clock time —
   * "86s ~02:19" for a dish with 70 portions, hours after the kitchen shut. The
   * honest statement is "enough for tonight", and only the engine knows when
   * service ends.
   */
  lastsThroughService: boolean;
  bindingIngredientId: string | null;
}

export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";

export interface DishPerformance {
  dishId: string;
  unitsSold: number;
  popularity: number;
  foodCostCents: number;
  marginCents: number;
  menuClass: MenuClass;
}

/** Band thresholds. Exported so tests and UI agree on the boundaries. */
export const BAND_THRESHOLDS = {
  criticalMinutes: 45,
  lowMinutes: 120,
  /** At low absolute counts the ratio is noisy, and "3 left" matters on its own. */
  criticalPortions: 3,
} as const;

/** Minimum velocity samples before a prediction is trustworthy. */
export const MIN_VELOCITY_SAMPLES = 3;

/** EWMA smoothing. 0.3 weights the recent past without one odd night dominating. */
export const EWMA_ALPHA = 0.3;
