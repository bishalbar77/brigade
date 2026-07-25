import { UNLIMITED, type Dish, type Ingredient, type RecipeItem } from "./types";

/**
 * Portions available for a dish: the binding ingredient decides.
 * Six steaks and one lemon means one steak dish.
 *
 *   portions(d) = min over i in recipe(d) of floor(stock_i / qty(d,i))
 *
 * Mirrors the dish_availability SQL view in supabase/migrations/008_views.sql.
 * Kept in TypeScript as well so the UI can recompute optimistically after a
 * realtime stock change without a round trip.
 */
export function portionsAvailable(
  recipe: readonly RecipeItem[],
  stockByIngredient: ReadonlyMap<string, number>,
): number {
  // No bill of materials means the recipe hasn't been entered yet, NOT that the
  // dish is unavailable. Treating it as unavailable would make a half-configured
  // menu look like a closed kitchen.
  if (recipe.length === 0) return UNLIMITED;

  let min = Infinity;
  for (const item of recipe) {
    // qty > 0 is enforced by a check constraint, but guard anyway rather than
    // emitting Infinity from a division by zero.
    if (item.qty <= 0) continue;
    const stock = stockByIngredient.get(item.ingredientId) ?? 0;
    // floor: half a portion is zero portions
    const possible = Math.floor(stock / item.qty);
    if (possible < min) min = possible;
  }

  if (min === Infinity) return UNLIMITED;
  // Negative stock should be impossible (place_order refuses first). If it happens
  // the ledger and projection have drifted — clamp for display, and the
  // reconciliation query in docs/08-runbook.md will surface the real bug.
  return Math.max(0, min);
}

/**
 * Which ingredient runs out first. "Branzino 86s at 20:40" is information;
 * "because you have 4 lemons" is something a chef can act on in five minutes.
 *
 * Ties break on ingredient id for determinism.
 */
export function bindingIngredient(
  recipe: readonly RecipeItem[],
  stockByIngredient: ReadonlyMap<string, number>,
): string | null {
  if (recipe.length === 0) return null;

  let bindingId: string | null = null;
  let fewest = Infinity;

  for (const item of recipe) {
    if (item.qty <= 0) continue;
    const stock = stockByIngredient.get(item.ingredientId) ?? 0;
    const possible = Math.floor(stock / item.qty);
    if (possible < fewest || (possible === fewest && bindingId !== null && item.ingredientId < bindingId)) {
      fewest = possible;
      bindingId = item.ingredientId;
    }
  }

  return bindingId;
}

export function isUnlimited(portions: number): boolean {
  return portions >= UNLIMITED;
}

/**
 * Total quantity of each ingredient an entire order requires.
 *
 * Aggregating across the whole order matters: two different dishes sharing the
 * last three lemons would each pass an independent availability check and
 * collectively oversell. place_order() does the same aggregation in SQL.
 */
export function aggregateDemand(
  items: readonly { dish: Dish; qty: number }[],
): Map<string, number> {
  const required = new Map<string, number>();
  for (const { dish, qty } of items) {
    for (const line of dish.recipe) {
      required.set(line.ingredientId, (required.get(line.ingredientId) ?? 0) + line.qty * qty);
    }
  }
  return required;
}

/**
 * Can this whole order be fulfilled? Returns the first shortfall, or null.
 * Deterministic: ingredients are checked in sorted id order.
 */
export function findShortfall(
  items: readonly { dish: Dish; qty: number }[],
  stockByIngredient: ReadonlyMap<string, number>,
): { ingredientId: string; required: number; available: number } | null {
  const demand = aggregateDemand(items);
  for (const ingredientId of [...demand.keys()].sort()) {
    const required = demand.get(ingredientId)!;
    const available = stockByIngredient.get(ingredientId) ?? 0;
    if (required > available) return { ingredientId, required, available };
  }
  return null;
}

export function isManually86(dish: Pick<Dish, "manual86Until">, now: Date = new Date()): boolean {
  return dish.manual86Until != null && dish.manual86Until.getTime() > now.getTime();
}

/** Food cost of one portion, from live ingredient costs. */
export function foodCostCents(
  recipe: readonly RecipeItem[],
  ingredientsById: ReadonlyMap<string, Pick<Ingredient, "costPerUnitCents">>,
): number {
  let total = 0;
  for (const line of recipe) {
    const ing = ingredientsById.get(line.ingredientId);
    if (!ing) continue;
    total += line.qty * ing.costPerUnitCents;
  }
  return Math.round(total);
}
