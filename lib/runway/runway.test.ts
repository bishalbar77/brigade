import { describe, expect, it } from "vitest";
import {
  aggregateDemand,
  bindingIngredient,
  findShortfall,
  foodCostCents,
  isManually86,
  portionsAvailable,
} from "./availability";
import { computeRunway, bandFor, byUrgency, runwayMinutes } from "./runway";
import { computeVelocity, currentDaypart, ewma, isServiceOpen, resolveVelocity } from "./velocity";
import {
  analyseMenu,
  classifyDish,
  dailyUsage,
  median,
  reorderPoint,
  suggestReorder,
  wasteVariance,
} from "./inventory";
import {
  buildCooccurrence,
  cosineSimilarity,
  normalise,
  recommend,
  scoreForSteering,
} from "./steering";
import { UNLIMITED, type Dish, type RunwayResult } from "./types";

/**
 * Executable version of the test plan in docs/05-runway-engine.md.
 * The maths is where correctness actually matters, so it gets real tests.
 */

// dinner 18:00–22:30, lunch 12:00–15:00
const WINDOWS = [
  { name: "lunch", startMinutes: 12 * 60, endMinutes: 15 * 60 },
  { name: "dinner", startMinutes: 18 * 60, endMinutes: 22 * 60 + 30 },
];

const at = (h: number, m = 0) => new Date(2026, 6, 25, h, m, 0);

const dish = (over: Partial<Dish> = {}): Dish => ({
  id: "d1",
  name: "Branzino",
  priceCents: 1900,
  recipe: [
    { ingredientId: "bass", qty: 1 },
    { ingredientId: "lemon", qty: 0.5 },
  ],
  manual86Until: null,
  ...over,
});

// ---------------------------------------------------------------- portions

describe("portionsAvailable", () => {
  it("is decided by the binding ingredient", () => {
    // 6 bass, 1 lemon at 0.5/portion = 2 portions. The lemon binds.
    const stock = new Map([["bass", 6], ["lemon", 1]]);
    expect(portionsAvailable(dish().recipe, stock)).toBe(2);
  });

  it("treats a dish with no BOM as unlimited, not unavailable", () => {
    // A half-configured menu must not read as a closed kitchen.
    expect(portionsAvailable([], new Map())).toBe(UNLIMITED);
  });

  it("floors fractional stock — half a portion is zero portions", () => {
    const stock = new Map([["bass", 2.9], ["lemon", 99]]);
    expect(portionsAvailable(dish().recipe, stock)).toBe(2);
  });

  it("returns 0 for a missing ingredient rather than throwing", () => {
    expect(portionsAvailable(dish().recipe, new Map([["bass", 5]]))).toBe(0);
  });

  it("clamps negative stock to 0 instead of emitting a negative portion count", () => {
    const stock = new Map([["bass", -3], ["lemon", 10]]);
    expect(portionsAvailable(dish().recipe, stock)).toBe(0);
  });

  it("ignores a zero-qty recipe line instead of dividing by zero", () => {
    const recipe = [{ ingredientId: "bass", qty: 0 }, { ingredientId: "lemon", qty: 1 }];
    const stock = new Map([["bass", 5], ["lemon", 4]]);
    expect(portionsAvailable(recipe, stock)).toBe(4);
  });
});

describe("bindingIngredient", () => {
  it("names the ingredient that runs out first", () => {
    const stock = new Map([["bass", 6], ["lemon", 1]]);
    expect(bindingIngredient(dish().recipe, stock)).toBe("lemon");
  });

  it("is null when there is no recipe", () => {
    expect(bindingIngredient([], new Map())).toBeNull();
  });
});

// ------------------------------------------------------- aggregate demand

describe("aggregateDemand / findShortfall", () => {
  it("aggregates a shared ingredient across DIFFERENT dishes", () => {
    // The bug this prevents: two dishes each pass an independent check but
    // collectively oversell the last lemons.
    const a = dish({ id: "a", recipe: [{ ingredientId: "lemon", qty: 1 }] });
    const b = dish({ id: "b", recipe: [{ ingredientId: "lemon", qty: 1 }] });
    const demand = aggregateDemand([{ dish: a, qty: 2 }, { dish: b, qty: 2 }]);
    expect(demand.get("lemon")).toBe(4);
  });

  it("catches a collective shortfall that per-dish checks would miss", () => {
    const a = dish({ id: "a", recipe: [{ ingredientId: "lemon", qty: 1 }] });
    const b = dish({ id: "b", recipe: [{ ingredientId: "lemon", qty: 1 }] });
    const stock = new Map([["lemon", 3]]);

    // each dish alone is fine (2 <= 3)
    expect(findShortfall([{ dish: a, qty: 2 }], stock)).toBeNull();
    // together they are not (4 > 3)
    expect(findShortfall([{ dish: a, qty: 2 }, { dish: b, qty: 2 }], stock)).toEqual({
      ingredientId: "lemon",
      required: 4,
      available: 3,
    });
  });
});

// ---------------------------------------------------------------- velocity

describe("ewma", () => {
  it("returns the single sample unchanged", () => {
    expect(ewma([4])).toBe(4);
  });

  it("weights recent samples more heavily", () => {
    // rising series → result above the arithmetic mean of 3
    const rising = ewma([1, 2, 3, 4, 5]);
    expect(rising).toBeGreaterThan(3);
    expect(rising).toBeLessThan(5);
  });

  it("is stable on a flat series", () => {
    expect(ewma([6, 6, 6, 6])).toBeCloseTo(6, 10);
  });

  it("returns 0 for no samples", () => {
    expect(ewma([])).toBe(0);
  });
});

describe("resolveVelocity", () => {
  it("uses dish velocity when there are enough samples", () => {
    const r = resolveVelocity(computeVelocity([4, 4, 4, 4]), 9, 9);
    expect(r.unitsPerHour).toBeCloseTo(4, 6);
    expect(r.insufficientHistory).toBe(false);
  });

  it("falls back to the category mean on cold start and flags it", () => {
    const r = resolveVelocity(computeVelocity([5]), 7, 3);
    expect(r.unitsPerHour).toBe(7);
    expect(r.insufficientHistory).toBe(true);
  });

  it("falls through to the global mean when there is no category mean", () => {
    const r = resolveVelocity(undefined, undefined, 2.5);
    expect(r.unitsPerHour).toBe(2.5);
    expect(r.insufficientHistory).toBe(true);
  });

  it("never silently reports a usable zero rate as sufficient history", () => {
    // A zero rate makes runway infinite, which would delete the feature silently.
    const r = resolveVelocity(computeVelocity([0, 0, 0, 0]), 0, 0);
    expect(r.insufficientHistory).toBe(true);
  });
});

describe("service hours", () => {
  it("identifies the current daypart", () => {
    expect(currentDaypart(at(19, 30), WINDOWS)?.name).toBe("dinner");
    expect(currentDaypart(at(13, 0), WINDOWS)?.name).toBe("lunch");
  });

  it("is closed between and outside services", () => {
    expect(isServiceOpen(at(16, 0), WINDOWS)).toBe(false);
    expect(isServiceOpen(at(4, 0), WINDOWS)).toBe(false);
    expect(currentDaypart(at(22, 30), WINDOWS)).toBeNull(); // end is exclusive
  });
});

// ----------------------------------------------------------------- runway

describe("runwayMinutes", () => {
  it("is portions / rate * 60", () => {
    expect(runwayMinutes(6, 6)).toBe(60);
    expect(runwayMinutes(4, 6)).toBe(40);
  });

  it("is null for unlimited or an unknown rate — never Infinity", () => {
    expect(runwayMinutes(UNLIMITED, 5)).toBeNull();
    expect(runwayMinutes(10, 0)).toBeNull();
  });
});

describe("bandFor", () => {
  it("bands on the documented boundaries", () => {
    expect(bandFor(0, null)).toBe("out");
    expect(bandFor(10, 30)).toBe("critical");   // < 45
    expect(bandFor(10, 44.9)).toBe("critical");
    expect(bandFor(10, 45)).toBe("low");        // boundary is exclusive
    expect(bandFor(10, 119.9)).toBe("low");
    expect(bandFor(10, 120)).toBe("plenty");
  });

  it("forces critical at 3 or fewer portions regardless of rate", () => {
    // At low absolute counts the ratio is noisy and "3 left" matters on its own.
    expect(bandFor(3, 100_000)).toBe("critical");
    expect(bandFor(4, 100_000)).toBe("plenty");
  });
});

describe("computeRunway", () => {
  const base = {
    stockByIngredient: new Map([["bass", 4], ["lemon", 50]]),
    velocity: computeVelocity([6, 6, 6, 6]),
    globalMeanVelocity: 5,
    serviceWindows: WINDOWS,
  };

  it("predicts an 86 time during service", () => {
    const r = computeRunway({ ...base, dish: dish(), now: at(19, 0) });
    expect(r.portions).toBe(4);
    expect(r.runwayMinutes).toBeCloseTo(40, 5);
    expect(r.band).toBe("critical");
    expect(r.predicted86At?.getHours()).toBe(19);
    expect(r.predicted86At?.getMinutes()).toBe(40);
    expect(r.bindingIngredientId).toBe("bass");
  });

  it("suppresses the prediction outside service hours", () => {
    // A board predicting an 86 at 04:00 destroys trust in every other number.
    const r = computeRunway({ ...base, dish: dish(), now: at(4, 0) });
    expect(r.portions).toBe(4);
    expect(r.runwayMinutes).toBeNull();
    expect(r.predicted86At).toBeNull();
  });

  it("flags insufficient history rather than fabricating a time", () => {
    const r = computeRunway({
      ...base,
      velocity: computeVelocity([6]),
      dish: dish(),
      now: at(19, 0),
    });
    expect(r.insufficientHistory).toBe(true);
    expect(r.runwayMinutes).toBeNull();
  });

  it("reports an unlimited dish without an infinite runway", () => {
    const r = computeRunway({ ...base, dish: dish({ recipe: [] }), now: at(19, 0) });
    expect(r.unlimited).toBe(true);
    expect(r.runwayMinutes).toBeNull();
    expect(r.band).toBe("plenty");
  });

  it("lets a manual 86 override computed availability", () => {
    const r = computeRunway({
      ...base,
      dish: dish({ manual86Until: at(23, 0) }),
      now: at(19, 0),
    });
    expect(r.band).toBe("out");
    expect(r.portions).toBe(0);
  });

  it("lets an expired manual 86 restore the dish automatically", () => {
    const r = computeRunway({
      ...base,
      dish: dish({ manual86Until: at(18, 0) }),
      now: at(19, 0),
    });
    expect(r.band).not.toBe("out");
    expect(r.portions).toBe(4);
  });

  it("gives a high-velocity dish a shorter runway than a low-velocity one at equal stock", () => {
    const fast = computeRunway({ ...base, velocity: computeVelocity([12, 12, 12, 12]), dish: dish(), now: at(19) });
    const slow = computeRunway({ ...base, velocity: computeVelocity([2, 2, 2, 2]), dish: dish(), now: at(19) });
    expect(fast.runwayMinutes!).toBeLessThan(slow.runwayMinutes!);
  });
});

describe("byUrgency", () => {
  it("sorts out → critical → low → plenty", () => {
    const mk = (band: RunwayResult["band"], minutes: number | null): RunwayResult => ({
      dishId: band, portions: 5, runwayMinutes: minutes, predicted86At: null,
      band, unlimited: false, insufficientHistory: false, bindingIngredientId: null,
    });
    const sorted = [mk("plenty", 300), mk("out", null), mk("low", 90), mk("critical", 20)]
      .sort(byUrgency)
      .map((r) => r.band);
    expect(sorted).toEqual(["out", "critical", "low", "plenty"]);
  });
});

// -------------------------------------------------------------- inventory

describe("reorder", () => {
  it("computes a reorder point with the safety factor", () => {
    expect(reorderPoint(10, 2)).toBeCloseTo(24, 6); // 10 * 2 * 1.2
  });

  it("sums daily usage across every dish using the ingredient", () => {
    const dishes = [
      { recipe: [{ ingredientId: "lemon", qty: 0.5 }], unitsPerHour: 4 },
      { recipe: [{ ingredientId: "lemon", qty: 1 }], unitsPerHour: 2 },
    ];
    // (4*0.5 + 2*1) * 8h = 32
    expect(dailyUsage("lemon", dishes, 8)).toBeCloseTo(32, 6);
  });

  it("flags an ingredient at or below its reorder point", () => {
    const s = suggestReorder(
      { id: "i", stockQty: 20, parLevel: 100, shelfLifeDays: null, leadTimeDays: 2 },
      10,
    );
    expect(s.needsOrder).toBe(true);       // 20 <= 24
    expect(s.suggestedQty).toBe(80);
  });

  it("caps the suggestion by shelf life, so it can't create the waste it prevents", () => {
    const s = suggestReorder(
      { id: "i", stockQty: 0, parLevel: 100, shelfLifeDays: 2, leadTimeDays: 1 },
      10, // 10/day * 2 days shelf life = 20 usable
    );
    expect(s.cappedByShelfLife).toBe(true);
    expect(s.suggestedQty).toBe(20);
  });

  it("does not suggest a negative quantity when overstocked", () => {
    const s = suggestReorder(
      { id: "i", stockQty: 200, parLevel: 100, shelfLifeDays: null, leadTimeDays: 1 },
      1,
    );
    expect(s.suggestedQty).toBe(0);
    expect(s.needsOrder).toBe(false);
  });
});

describe("menu engineering", () => {
  it("uses medians so one outlier cannot move the boundary", () => {
    expect(median([1, 2, 3, 4, 1000])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("classifies all four quadrants", () => {
    expect(classifyDish(0.3, 900, 0.2, 500)).toBe("star");
    expect(classifyDish(0.3, 100, 0.2, 500)).toBe("plowhorse");
    expect(classifyDish(0.1, 900, 0.2, 500)).toBe("puzzle");
    expect(classifyDish(0.1, 100, 0.2, 500)).toBe("dog");
  });

  it("lands a seeded dish in each quadrant end to end", () => {
    const ing = new Map([
      ["cheap", { costPerUnitCents: 10 }],
      ["dear", { costPerUnitCents: 900 }],
    ]);
    const rows = [
      { dish: { id: "star",      priceCents: 2000, recipe: [{ ingredientId: "cheap", qty: 1 }] }, unitsSold: 100 },
      { dish: { id: "plowhorse", priceCents: 1000, recipe: [{ ingredientId: "dear",  qty: 1 }] }, unitsSold: 100 },
      { dish: { id: "puzzle",    priceCents: 2000, recipe: [{ ingredientId: "cheap", qty: 1 }] }, unitsSold: 1 },
      { dish: { id: "dog",       priceCents: 1000, recipe: [{ ingredientId: "dear",  qty: 1 }] }, unitsSold: 1 },
    ];
    const byId = new Map(analyseMenu(rows, ing).map((p) => [p.dishId, p.menuClass]));
    expect(byId.get("star")).toBe("star");
    expect(byId.get("plowhorse")).toBe("plowhorse");
    expect(byId.get("puzzle")).toBe("puzzle");
    expect(byId.get("dog")).toBe("dog");
  });

  it("honours a historical cost so past margins do not move when prices change", () => {
    const ing = new Map([["x", { costPerUnitCents: 5000 }]]); // price raised today
    const [row] = analyseMenu(
      [{ dish: { id: "d", priceCents: 2000, recipe: [{ ingredientId: "x", qty: 1 }] },
         unitsSold: 10, costAtSaleCents: 400 }],
      ing,
    );
    expect(row!.foodCostCents).toBe(400);
    expect(row!.marginCents).toBe(1600);
  });

  it("computes food cost from the BOM", () => {
    const ing = new Map([["bass", { costPerUnitCents: 420 }], ["lemon", { costPerUnitCents: 30 }]]);
    expect(foodCostCents(dish().recipe, ing)).toBe(435); // 420 + 15
  });
});

describe("wasteVariance", () => {
  it("reports the gap between theoretical and actual usage", () => {
    const v = wasteVariance(100, 109);
    expect(v.variance).toBe(-9);
    expect(v.variancePct).toBeCloseTo(-0.09, 6);
  });

  it("does not divide by zero with no theoretical usage", () => {
    expect(wasteVariance(0, 5).variancePct).toBe(0);
  });
});

// --------------------------------------------------------------- steering

describe("normalise", () => {
  it("maps into 0..1 and handles a degenerate range", () => {
    expect(normalise(5, 0, 10)).toBe(0.5);
    expect(normalise(-5, 0, 10)).toBe(0);
    expect(normalise(50, 0, 10)).toBe(1);
    expect(normalise(7, 7, 7)).toBe(0.5);
  });
});

describe("scoreForSteering", () => {
  const runway = (band: RunwayResult["band"], minutes: number | null): RunwayResult => ({
    dishId: "x", portions: 10, runwayMinutes: minutes, predicted86At: null,
    band, unlimited: false, insufficientHistory: false, bindingIngredientId: null,
  });

  it("demotes a critical dish below an equivalent plenty dish", () => {
    const ranked = scoreForSteering([
      { dishId: "critical", marginCents: 1000, runway: runway("critical", 20), affinity: 0 },
      { dishId: "plenty",   marginCents: 1000, runway: runway("plenty", 300),  affinity: 0 },
    ]);
    expect(ranked[0]!.dishId).toBe("plenty");
  });

  it("prefers the higher-margin dish when scarcity is equal", () => {
    const ranked = scoreForSteering([
      { dishId: "low-margin",  marginCents: 100,  runway: runway("plenty", 300), affinity: 0 },
      { dishId: "high-margin", marginCents: 2000, runway: runway("plenty", 300), affinity: 0 },
    ]);
    expect(ranked[0]!.dishId).toBe("high-margin");
  });

  it("lets affinity break a tie", () => {
    const ranked = scoreForSteering([
      { dishId: "cold", marginCents: 1000, runway: runway("plenty", 300), affinity: 0 },
      { dishId: "warm", marginCents: 1000, runway: runway("plenty", 300), affinity: 1 },
    ]);
    expect(ranked[0]!.dishId).toBe("warm");
  });

  it("is deterministic for identical inputs", () => {
    const input = [
      { dishId: "b", marginCents: 500, runway: runway("plenty", 200), affinity: 0 },
      { dishId: "a", marginCents: 500, runway: runway("plenty", 200), affinity: 0 },
    ];
    expect(scoreForSteering(input).map((r) => r.dishId)).toEqual(["a", "b"]);
  });
});

describe("recommend", () => {
  const candidates = [
    { dishId: "wine",   portions: 10, allergens: ["sulphites"], marginCents: 900, popularity: 0.3 },
    { dishId: "bread",  portions: 10, allergens: ["gluten"],    marginCents: 300, popularity: 0.5 },
    { dishId: "eighty", portions: 0,  allergens: [],            marginCents: 900, popularity: 0.9 },
    { dishId: "nuts",   portions: 10, allergens: ["nuts"],      marginCents: 900, popularity: 0.9 },
  ];
  const orders = [["steak", "wine"], ["steak", "wine"], ["steak", "bread"], ["fish", "bread"]];

  it("never recommends an unavailable dish", () => {
    // Worse than no recommender: suggesting something the kitchen can't make.
    const out = recommend(["steak"], candidates, buildCooccurrence(orders), [], 4);
    expect(out).not.toContain("eighty");
  });

  it("excludes an allergen match entirely, not just ranks it down", () => {
    const out = recommend(["steak"], candidates, buildCooccurrence(orders), ["NUTS"], 4);
    expect(out).not.toContain("nuts");
  });

  it("prefers the more co-occurring dish", () => {
    const out = recommend(["steak"], candidates, buildCooccurrence(orders), [], 1);
    expect(out).toEqual(["wine"]);
  });

  it("falls back to margin x popularity on cold start, never empty", () => {
    const out = recommend([], candidates, new Map(), [], 2);
    expect(out.length).toBe(2);
    expect(out[0]).toBe("nuts"); // 900 * 0.9 is the highest product
  });

  it("does not recommend a dish already in the seed set", () => {
    const out = recommend(["wine"], candidates, buildCooccurrence(orders), [], 4);
    expect(out).not.toContain("wine");
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for disjoint ones", () => {
    const a = new Map([["x", 1], ["y", 2]]);
    expect(cosineSimilarity(a, new Map([["x", 1], ["y", 2]]))).toBeCloseTo(1, 10);
    expect(cosineSimilarity(a, new Map([["z", 5]]))).toBe(0);
  });

  it("is 0 against an empty vector rather than NaN", () => {
    expect(cosineSimilarity(new Map([["x", 1]]), new Map())).toBe(0);
  });
});

describe("isManually86", () => {
  it("is true only while the override is in the future", () => {
    expect(isManually86({ manual86Until: at(23) }, at(19))).toBe(true);
    expect(isManually86({ manual86Until: at(18) }, at(19))).toBe(false);
    expect(isManually86({ manual86Until: null }, at(19))).toBe(false);
  });
});
