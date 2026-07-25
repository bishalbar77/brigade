import { foodCostCents } from "./availability";
import type { Dish, DishPerformance, Ingredient, MenuClass, RecipeItem } from "./types";

/**
 * Reorder prediction and menu engineering. See docs/05-runway-engine.md §4–5, §8.
 */

/** Safety factor covering demand variance and late deliveries. */
const SAFETY_FACTOR = 1.2;

export interface DishUsage {
  recipe: readonly RecipeItem[];
  unitsPerHour: number;
}

/**
 * How much of an ingredient gets used per day, summed across every dish using it.
 */
export function dailyUsage(
  ingredientId: string,
  dishes: readonly DishUsage[],
  openHoursPerDay: number,
): number {
  let total = 0;
  for (const dish of dishes) {
    for (const line of dish.recipe) {
      if (line.ingredientId === ingredientId) {
        total += dish.unitsPerHour * line.qty * openHoursPerDay;
      }
    }
  }
  return total;
}

export function reorderPoint(dailyUsageQty: number, leadTimeDays: number): number {
  return dailyUsageQty * leadTimeDays * SAFETY_FACTOR;
}

export interface ReorderSuggestion {
  ingredientId: string;
  needsOrder: boolean;
  suggestedQty: number;
  reorderPoint: number;
  /** true when shelf life, not par level, decided the quantity. */
  cappedByShelfLife: boolean;
}

/**
 * What to order and how much.
 *
 * The shelf-life cap matters: never suggest buying more perishable stock than can
 * be used before it spoils. A naive reorder system generates exactly the waste it
 * was bought to prevent.
 */
export function suggestReorder(
  ingredient: Pick<Ingredient, "id" | "stockQty" | "parLevel" | "shelfLifeDays" | "leadTimeDays">,
  dailyUsageQty: number,
): ReorderSuggestion {
  const point = reorderPoint(dailyUsageQty, ingredient.leadTimeDays);
  const toPar = Math.max(0, ingredient.parLevel - ingredient.stockQty);

  let suggestedQty = toPar;
  let cappedByShelfLife = false;

  if (ingredient.shelfLifeDays != null && dailyUsageQty > 0) {
    const usableBeforeSpoiling = dailyUsageQty * ingredient.shelfLifeDays;
    if (usableBeforeSpoiling < toPar) {
      suggestedQty = usableBeforeSpoiling;
      cappedByShelfLife = true;
    }
  }

  return {
    ingredientId: ingredient.id,
    needsOrder: ingredient.stockQty <= point,
    suggestedQty: Math.ceil(suggestedQty * 100) / 100,
    reorderPoint: point,
    cappedByShelfLife,
  };
}

/**
 * Kasavana–Smith menu engineering.
 *
 * Medians, not means: one outlier dish shouldn't move the quadrant boundaries.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function classifyDish(
  popularity: number,
  marginCents: number,
  medianPopularity: number,
  medianMargin: number,
): MenuClass {
  const popular = popularity >= medianPopularity;
  const profitable = marginCents >= medianMargin;
  if (popular && profitable) return "star";
  if (popular && !profitable) return "plowhorse";
  if (!popular && profitable) return "puzzle";
  return "dog";
}

/**
 * Classify a whole menu. `costAtSaleCents` lets callers pass the historical cost —
 * margin must use cost as at the time of sale, so a supplier raising a price today
 * does not retroactively change last month's reported profit.
 */
export function analyseMenu(
  rows: readonly {
    dish: Pick<Dish, "id" | "priceCents" | "recipe">;
    unitsSold: number;
    costAtSaleCents?: number;
  }[],
  ingredientsById: ReadonlyMap<string, Pick<Ingredient, "costPerUnitCents">>,
): DishPerformance[] {
  const totalUnits = rows.reduce((sum, r) => sum + r.unitsSold, 0);

  const enriched = rows.map((r) => {
    const cost = r.costAtSaleCents ?? foodCostCents(r.dish.recipe, ingredientsById);
    return {
      dishId: r.dish.id,
      unitsSold: r.unitsSold,
      popularity: totalUnits === 0 ? 0 : r.unitsSold / totalUnits,
      foodCostCents: cost,
      marginCents: r.dish.priceCents - cost,
    };
  });

  const medPop = median(enriched.map((e) => e.popularity));
  const medMargin = median(enriched.map((e) => e.marginCents));

  return enriched.map((e) => ({
    ...e,
    menuClass: classifyDish(e.popularity, e.marginCents, medPop, medMargin),
  }));
}

/**
 * Waste variance: what the recipes say should have been used, versus what the
 * ledger says actually moved.
 *
 * Negative variance means stock left without being sold. Only computable because
 * stock_movements is append-only (ADR-5).
 *
 * Framing rule for the UI: surface as "investigate this", never "someone stole
 * this". Over-portioning, poor prep yields and theft are indistinguishable here,
 * and the system does not know which it is.
 */
export function wasteVariance(theoreticalUsed: number, actualUsed: number): {
  variance: number;
  variancePct: number;
} {
  const variance = theoreticalUsed - actualUsed;
  return {
    variance,
    variancePct: theoreticalUsed === 0 ? 0 : variance / theoreticalUsed,
  };
}
