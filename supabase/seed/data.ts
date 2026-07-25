/**
 * Seed reference data: a plausible modern Indian restaurant. Money is PAISE.
 *
 * Dish popularity weights are deliberately UNEVEN. If every dish sells equally the
 * menu-engineering matrix has nothing to say and the analytics look fake — which is
 * the single most common way hackathon dashboards lose credibility.
 */

export interface SeedIngredient {
  name: string;
  unit: string;
  costPerUnitCents: number;
  parLevel: number;
  shelfLifeDays: number | null;
  supplier: string;
}

export interface SeedDish {
  name: string;
  description: string;
  category: string;
  station: "grill" | "saute" | "larder" | "pastry" | "bar";
  priceCents: number;
  prepMinutes: number;
  allergens: string[];
  tags: string[];
  /** relative sales weight — drives the popularity axis of the matrix */
  weight: number;
  recipe: { ingredient: string; qty: number }[];
}

export const SUPPLIERS = [
  { name: "Crawford Market Fish", contact: "orders@crawfordfish.test", leadTimeDays: 2 },
  { name: "Deonar Halal Meats", contact: "sales@deonarmeats.test", leadTimeDays: 1 },
  { name: "Dadar Sabzi Mandi", contact: "hello@dadarmandi.test", leadTimeDays: 1 },
  { name: "Aarey Dairy", contact: "orders@aareydairy.test", leadTimeDays: 1 },
  { name: "Masala Bhandar", contact: "trade@masalabhandar.test", leadTimeDays: 3 },
];

/*
 * Costs are in PAISE per unit — integer, like every other money value in this app.
 * ₹280/kg chicken is 28000. Roughly Mumbai wholesale, early 2026.
 *
 * Shelf life and par level are what make the runway board interesting. The prawns and
 * the goat are the demo: expensive, two-day shelf life, low par, and each binds more
 * than one dish — so a table ordering tandoori prawns moves the countdown on kadai
 * prawns too, which is the per-ingredient aggregation in place_order() made visible.
 */
export const INGREDIENTS: SeedIngredient[] = [
  // seafood — short shelf life, expensive, the usual binding constraint
  { name: "Tiger prawns", unit: "kg", costPerUnitCents: 62000, parLevel: 6, shelfLifeDays: 2, supplier: "Crawford Market Fish" },

  // meat
  { name: "Goat leg, bone-in", unit: "kg", costPerUnitCents: 78000, parLevel: 10, shelfLifeDays: 3, supplier: "Deonar Halal Meats" },
  { name: "Goat mince", unit: "kg", costPerUnitCents: 72000, parLevel: 6, shelfLifeDays: 2, supplier: "Deonar Halal Meats" },
  { name: "Chicken thigh, boneless", unit: "kg", costPerUnitCents: 29000, parLevel: 18, shelfLifeDays: 2, supplier: "Deonar Halal Meats" },
  { name: "Chicken, bone-in", unit: "kg", costPerUnitCents: 21000, parLevel: 16, shelfLifeDays: 2, supplier: "Deonar Halal Meats" },

  // dairy — paneer is the vegetarian backbone of half the menu
  { name: "Paneer", unit: "kg", costPerUnitCents: 39000, parLevel: 12, shelfLifeDays: 3, supplier: "Aarey Dairy" },
  { name: "Dahi (curd)", unit: "kg", costPerUnitCents: 8500, parLevel: 20, shelfLifeDays: 5, supplier: "Aarey Dairy" },
  { name: "Fresh cream", unit: "L", costPerUnitCents: 23000, parLevel: 10, shelfLifeDays: 6, supplier: "Aarey Dairy" },
  { name: "Butter", unit: "kg", costPerUnitCents: 52000, parLevel: 15, shelfLifeDays: 30, supplier: "Aarey Dairy" },
  { name: "Ghee", unit: "kg", costPerUnitCents: 68000, parLevel: 10, shelfLifeDays: null, supplier: "Aarey Dairy" },
  { name: "Full cream milk", unit: "L", costPerUnitCents: 6400, parLevel: 25, shelfLifeDays: 3, supplier: "Aarey Dairy" },
  { name: "Khoya", unit: "kg", costPerUnitCents: 42000, parLevel: 4, shelfLifeDays: 4, supplier: "Aarey Dairy" },

  // produce
  { name: "Onion", unit: "kg", costPerUnitCents: 3600, parLevel: 60, shelfLifeDays: 21, supplier: "Dadar Sabzi Mandi" },
  { name: "Tomato", unit: "kg", costPerUnitCents: 4200, parLevel: 40, shelfLifeDays: 6, supplier: "Dadar Sabzi Mandi" },
  { name: "Ginger", unit: "kg", costPerUnitCents: 12000, parLevel: 8, shelfLifeDays: 14, supplier: "Dadar Sabzi Mandi" },
  { name: "Garlic", unit: "kg", costPerUnitCents: 15000, parLevel: 8, shelfLifeDays: 30, supplier: "Dadar Sabzi Mandi" },
  { name: "Green chilli", unit: "kg", costPerUnitCents: 6000, parLevel: 5, shelfLifeDays: 7, supplier: "Dadar Sabzi Mandi" },
  { name: "Coriander leaves", unit: "kg", costPerUnitCents: 6000, parLevel: 4, shelfLifeDays: 3, supplier: "Dadar Sabzi Mandi" },
  { name: "Mint leaves", unit: "kg", costPerUnitCents: 8000, parLevel: 3, shelfLifeDays: 3, supplier: "Dadar Sabzi Mandi" },
  { name: "Palak (spinach)", unit: "kg", costPerUnitCents: 4000, parLevel: 10, shelfLifeDays: 3, supplier: "Dadar Sabzi Mandi" },
  { name: "Potato", unit: "kg", costPerUnitCents: 3000, parLevel: 30, shelfLifeDays: 21, supplier: "Dadar Sabzi Mandi" },
  { name: "Carrot", unit: "kg", costPerUnitCents: 4400, parLevel: 12, shelfLifeDays: 14, supplier: "Dadar Sabzi Mandi" },
  { name: "Lemon", unit: "ea", costPerUnitCents: 500, parLevel: 100, shelfLifeDays: 14, supplier: "Dadar Sabzi Mandi" },
  { name: "Alphonso mango pulp", unit: "kg", costPerUnitCents: 21000, parLevel: 6, shelfLifeDays: null, supplier: "Dadar Sabzi Mandi" },

  // dry goods, dals, spice
  { name: "Basmati rice", unit: "kg", costPerUnitCents: 11500, parLevel: 40, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Urad dal, whole", unit: "kg", costPerUnitCents: 13500, parLevel: 15, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Rajma", unit: "kg", costPerUnitCents: 12500, parLevel: 8, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Atta (wheat flour)", unit: "kg", costPerUnitCents: 4600, parLevel: 40, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Maida (refined flour)", unit: "kg", costPerUnitCents: 4200, parLevel: 30, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Besan (gram flour)", unit: "kg", costPerUnitCents: 9500, parLevel: 10, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Cashew", unit: "kg", costPerUnitCents: 82000, parLevel: 5, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Pistachio", unit: "kg", costPerUnitCents: 120000, parLevel: 2, shelfLifeDays: null, supplier: "Masala Bhandar" },
  // Priced per GRAM, because saffron is, and because a per-kg figure here would make
  // every margin on the biryani look wrong by three orders of magnitude.
  { name: "Kesar (saffron)", unit: "g", costPerUnitCents: 32000, parLevel: 40, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Garam masala", unit: "kg", costPerUnitCents: 52000, parLevel: 4, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Kashmiri chilli powder", unit: "kg", costPerUnitCents: 36000, parLevel: 5, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Kasuri methi", unit: "kg", costPerUnitCents: 41000, parLevel: 2, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Cumin seed", unit: "kg", costPerUnitCents: 34000, parLevel: 5, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Sev & papdi", unit: "kg", costPerUnitCents: 18000, parLevel: 6, shelfLifeDays: 20, supplier: "Masala Bhandar" },
  { name: "Tamarind pulp", unit: "kg", costPerUnitCents: 20000, parLevel: 4, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Jaggery", unit: "kg", costPerUnitCents: 7000, parLevel: 6, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Sugar", unit: "kg", costPerUnitCents: 4700, parLevel: 25, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Papad", unit: "ea", costPerUnitCents: 700, parLevel: 120, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Refined oil", unit: "L", costPerUnitCents: 14500, parLevel: 25, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Assam CTC tea", unit: "kg", costPerUnitCents: 42000, parLevel: 4, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Soda water", unit: "L", costPerUnitCents: 4000, parLevel: 20, shelfLifeDays: null, supplier: "Masala Bhandar" },
  { name: "Kingfisher lager", unit: "ea", costPerUnitCents: 11000, parLevel: 48, shelfLifeDays: null, supplier: "Masala Bhandar" },
];

export const CATEGORIES = [
  "Chaat", "Tandoor", "Curries", "Biryani & Rice", "Breads", "Sides", "Mithai", "Drinks",
];

/*
 * The menu. Prices in PAISE — ₹480 butter chicken is 48000.
 *
 * `station` still uses the five values in the `station` enum, because renaming a
 * Postgres enum the day before a deadline is not a trade worth making. What each one is
 * CALLED is a display concern, and STATION_LABEL in lib/ops/tickets.ts now reads
 * Tandoor / Curry / Chaat / Mithai / Bar — so the KDS says what an Indian kitchen says
 * while the schema stays put:
 *
 *   grill  -> Tandoor   (kebabs and every bread)
 *   saute  -> Curry     (the wet section: gravies, dals, biryani)
 *   larder -> Chaat     (cold assembly)
 *   pastry -> Mithai
 *   bar    -> Bar
 *
 * Weights are deliberately uneven, and shaped like a real Indian bill: butter chicken
 * and naan outsell everything, dal makhani is close behind, and the prawns are a
 * once-a-service order. An even spread gives the Kasavana-Smith matrix nothing to say.
 */
export const DISHES: SeedDish[] = [
  // ---- Chaat
  { name: "Papdi chaat", description: "Crisp papdi, dahi, tamarind, sev.",
    category: "Chaat", station: "larder", priceCents: 18000, prepMinutes: 4,
    allergens: ["gluten", "dairy"], tags: ["vegetarian"], weight: 22,
    recipe: [{ ingredient: "Sev & papdi", qty: 0.06 }, { ingredient: "Dahi (curd)", qty: 0.08 },
             { ingredient: "Tamarind pulp", qty: 0.02 }, { ingredient: "Jaggery", qty: 0.01 },
             { ingredient: "Potato", qty: 0.05 }, { ingredient: "Coriander leaves", qty: 0.005 }] },
  { name: "Punjabi samosa", description: "Two, potato and pea, tamarind chutney.",
    category: "Chaat", station: "saute", priceCents: 12000, prepMinutes: 6,
    allergens: ["gluten"], tags: ["vegetarian", "vegan"], weight: 26,
    recipe: [{ ingredient: "Maida (refined flour)", qty: 0.07 }, { ingredient: "Potato", qty: 0.12 },
             { ingredient: "Refined oil", qty: 0.04 }, { ingredient: "Cumin seed", qty: 0.002 },
             { ingredient: "Tamarind pulp", qty: 0.015 }] },
  { name: "Dahi puri", description: "Six puris, sweet dahi, pomegranate.",
    category: "Chaat", station: "larder", priceCents: 19000, prepMinutes: 5,
    allergens: ["gluten", "dairy"], tags: ["vegetarian"], weight: 13,
    recipe: [{ ingredient: "Sev & papdi", qty: 0.05 }, { ingredient: "Dahi (curd)", qty: 0.1 },
             { ingredient: "Potato", qty: 0.04 }, { ingredient: "Mint leaves", qty: 0.005 }] },

  // ---- Tandoor
  { name: "Murgh malai tikka", description: "Cream and cardamom marinade, charred soft.",
    category: "Tandoor", station: "grill", priceCents: 42000, prepMinutes: 14,
    allergens: ["dairy", "nuts"], tags: [], weight: 20,
    recipe: [{ ingredient: "Chicken thigh, boneless", qty: 0.22 }, { ingredient: "Fresh cream", qty: 0.04 },
             { ingredient: "Cashew", qty: 0.02 }, { ingredient: "Ginger", qty: 0.008 },
             { ingredient: "Garlic", qty: 0.008 }] },
  { name: "Paneer tikka", description: "Achari marinade, blistered peppers.",
    category: "Tandoor", station: "grill", priceCents: 36000, prepMinutes: 12,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 17,
    recipe: [{ ingredient: "Paneer", qty: 0.18 }, { ingredient: "Dahi (curd)", qty: 0.05 },
             { ingredient: "Kashmiri chilli powder", qty: 0.004 }, { ingredient: "Onion", qty: 0.05 }] },
  { name: "Mutton seekh kebab", description: "Hand-minced goat, mint chutney.",
    category: "Tandoor", station: "grill", priceCents: 46000, prepMinutes: 16,
    allergens: [], tags: [], weight: 9,
    recipe: [{ ingredient: "Goat mince", qty: 0.2 }, { ingredient: "Onion", qty: 0.04 },
             { ingredient: "Garam masala", qty: 0.004 }, { ingredient: "Mint leaves", qty: 0.008 }] },
  // The demo dish: dear, two-day shelf life, low par, and it shares its prawns with
  // the kadai below — so one table ordering moves two countdowns.
  { name: "Tandoori prawns", description: "Tiger prawns, ajwain, burnt lime.",
    category: "Tandoor", station: "grill", priceCents: 58000, prepMinutes: 13,
    allergens: ["shellfish"], tags: [], weight: 5,
    recipe: [{ ingredient: "Tiger prawns", qty: 0.18 }, { ingredient: "Dahi (curd)", qty: 0.03 },
             { ingredient: "Lemon", qty: 0.5 }, { ingredient: "Kashmiri chilli powder", qty: 0.003 }] },

  // ---- Curries
  { name: "Butter chicken", description: "Tandoori chicken, tomato and cream, kasuri methi.",
    category: "Curries", station: "saute", priceCents: 48000, prepMinutes: 15,
    allergens: ["dairy", "nuts"], tags: [], weight: 42,
    recipe: [{ ingredient: "Chicken thigh, boneless", qty: 0.2 }, { ingredient: "Tomato", qty: 0.18 },
             { ingredient: "Butter", qty: 0.04 }, { ingredient: "Fresh cream", qty: 0.05 },
             { ingredient: "Cashew", qty: 0.02 }, { ingredient: "Kasuri methi", qty: 0.002 }] },
  { name: "Dal makhani", description: "Urad and rajma, twenty-four hours on the flame.",
    category: "Curries", station: "saute", priceCents: 32000, prepMinutes: 10,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 34,
    recipe: [{ ingredient: "Urad dal, whole", qty: 0.09 }, { ingredient: "Rajma", qty: 0.02 },
             { ingredient: "Butter", qty: 0.03 }, { ingredient: "Fresh cream", qty: 0.03 },
             { ingredient: "Tomato", qty: 0.08 }] },
  { name: "Paneer butter masala", description: "Fresh paneer, cashew gravy, honey.",
    category: "Curries", station: "saute", priceCents: 38000, prepMinutes: 12,
    allergens: ["dairy", "nuts"], tags: ["vegetarian"], weight: 24,
    recipe: [{ ingredient: "Paneer", qty: 0.16 }, { ingredient: "Tomato", qty: 0.16 },
             { ingredient: "Cashew", qty: 0.025 }, { ingredient: "Butter", qty: 0.03 },
             { ingredient: "Fresh cream", qty: 0.04 }] },
  { name: "Rogan josh", description: "Kashmiri goat on the bone, ratanjot.",
    category: "Curries", station: "saute", priceCents: 58000, prepMinutes: 18,
    allergens: ["dairy"], tags: [], weight: 11,
    recipe: [{ ingredient: "Goat leg, bone-in", qty: 0.28 }, { ingredient: "Dahi (curd)", qty: 0.06 },
             { ingredient: "Onion", qty: 0.1 }, { ingredient: "Kashmiri chilli powder", qty: 0.005 },
             { ingredient: "Ghee", qty: 0.02 }] },
  { name: "Palak paneer", description: "Stone-ground spinach, ginger, no cream.",
    category: "Curries", station: "saute", priceCents: 36000, prepMinutes: 11,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 19,
    recipe: [{ ingredient: "Palak (spinach)", qty: 0.25 }, { ingredient: "Paneer", qty: 0.12 },
             { ingredient: "Ginger", qty: 0.01 }, { ingredient: "Ghee", qty: 0.015 }] },
  { name: "Kadai prawns", description: "Tiger prawns, crushed coriander, capsicum.",
    category: "Curries", station: "saute", priceCents: 62000, prepMinutes: 14,
    allergens: ["shellfish"], tags: [], weight: 6,
    recipe: [{ ingredient: "Tiger prawns", qty: 0.16 }, { ingredient: "Tomato", qty: 0.1 },
             { ingredient: "Onion", qty: 0.06 }, { ingredient: "Green chilli", qty: 0.01 },
             { ingredient: "Coriander leaves", qty: 0.008 }] },

  // ---- Biryani & Rice
  { name: "Hyderabadi mutton biryani", description: "Sealed dum, kesar, boiled egg.",
    category: "Biryani & Rice", station: "saute", priceCents: 62000, prepMinutes: 22,
    allergens: ["dairy"], tags: [], weight: 16,
    recipe: [{ ingredient: "Goat leg, bone-in", qty: 0.25 }, { ingredient: "Basmati rice", qty: 0.18 },
             { ingredient: "Dahi (curd)", qty: 0.07 }, { ingredient: "Kesar (saffron)", qty: 0.15 },
             { ingredient: "Ghee", qty: 0.03 }, { ingredient: "Mint leaves", qty: 0.01 }] },
  { name: "Chicken dum biryani", description: "Bone-in, sealed and baked, mirchi ka salan.",
    category: "Biryani & Rice", station: "saute", priceCents: 52000, prepMinutes: 20,
    allergens: ["dairy"], tags: [], weight: 28,
    recipe: [{ ingredient: "Chicken, bone-in", qty: 0.3 }, { ingredient: "Basmati rice", qty: 0.18 },
             { ingredient: "Dahi (curd)", qty: 0.07 }, { ingredient: "Kesar (saffron)", qty: 0.1 },
             { ingredient: "Ghee", qty: 0.025 }] },
  { name: "Jeera rice", description: "Basmati, cumin, ghee.",
    category: "Biryani & Rice", station: "saute", priceCents: 18000, prepMinutes: 8,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 20,
    recipe: [{ ingredient: "Basmati rice", qty: 0.12 }, { ingredient: "Cumin seed", qty: 0.003 },
             { ingredient: "Ghee", qty: 0.015 }] },

  // ---- Breads — everything off the tandoor
  { name: "Butter naan", description: "Refined flour, tandoor, salted butter.",
    category: "Breads", station: "grill", priceCents: 8000, prepMinutes: 5,
    allergens: ["gluten", "dairy"], tags: ["vegetarian"], weight: 58,
    recipe: [{ ingredient: "Maida (refined flour)", qty: 0.1 }, { ingredient: "Butter", qty: 0.012 },
             { ingredient: "Full cream milk", qty: 0.03 }] },
  { name: "Garlic naan", description: "Crushed garlic, coriander.",
    category: "Breads", station: "grill", priceCents: 10000, prepMinutes: 5,
    allergens: ["gluten", "dairy"], tags: ["vegetarian"], weight: 38,
    recipe: [{ ingredient: "Maida (refined flour)", qty: 0.1 }, { ingredient: "Garlic", qty: 0.008 },
             { ingredient: "Butter", qty: 0.012 }, { ingredient: "Coriander leaves", qty: 0.003 }] },
  { name: "Laccha paratha", description: "Whole wheat, layered, ghee.",
    category: "Breads", station: "grill", priceCents: 11000, prepMinutes: 6,
    allergens: ["gluten", "dairy"], tags: ["vegetarian"], weight: 21,
    recipe: [{ ingredient: "Atta (wheat flour)", qty: 0.11 }, { ingredient: "Ghee", qty: 0.015 }] },

  // ---- Sides
  { name: "Boondi raita", description: "Whisked dahi, gram-flour boondi, roast cumin.",
    category: "Sides", station: "larder", priceCents: 12000, prepMinutes: 3,
    allergens: ["dairy", "gluten"], tags: ["vegetarian"], weight: 24,
    recipe: [{ ingredient: "Dahi (curd)", qty: 0.15 }, { ingredient: "Besan (gram flour)", qty: 0.02 },
             { ingredient: "Cumin seed", qty: 0.002 }] },
  { name: "Masala papad", description: "Roasted, onion, tomato, chaat masala.",
    category: "Sides", station: "larder", priceCents: 8000, prepMinutes: 3,
    allergens: [], tags: ["vegetarian", "vegan"], weight: 18,
    recipe: [{ ingredient: "Papad", qty: 2 }, { ingredient: "Onion", qty: 0.04 },
             { ingredient: "Tomato", qty: 0.04 }] },

  // ---- Mithai
  { name: "Gulab jamun", description: "Two, khoya, warm rose syrup.",
    category: "Mithai", station: "pastry", priceCents: 18000, prepMinutes: 4,
    allergens: ["dairy", "gluten"], tags: ["vegetarian"], weight: 20,
    recipe: [{ ingredient: "Khoya", qty: 0.06 }, { ingredient: "Sugar", qty: 0.05 },
             { ingredient: "Maida (refined flour)", qty: 0.01 }, { ingredient: "Refined oil", qty: 0.03 }] },
  { name: "Gajar ka halwa", description: "Slow-cooked carrot, ghee, pistachio.",
    category: "Mithai", station: "pastry", priceCents: 20000, prepMinutes: 5,
    allergens: ["dairy", "nuts"], tags: ["vegetarian"], weight: 12,
    recipe: [{ ingredient: "Carrot", qty: 0.2 }, { ingredient: "Full cream milk", qty: 0.1 },
             { ingredient: "Ghee", qty: 0.02 }, { ingredient: "Sugar", qty: 0.04 },
             { ingredient: "Pistachio", qty: 0.008 }] },
  { name: "Kulfi falooda", description: "Malai kulfi, rose, vermicelli.",
    category: "Mithai", station: "pastry", priceCents: 22000, prepMinutes: 4,
    allergens: ["dairy", "gluten", "nuts"], tags: ["vegetarian"], weight: 8,
    recipe: [{ ingredient: "Full cream milk", qty: 0.18 }, { ingredient: "Khoya", qty: 0.03 },
             { ingredient: "Sugar", qty: 0.03 }, { ingredient: "Pistachio", qty: 0.006 }] },

  // ---- Drinks
  { name: "Masala chai", description: "Assam CTC, ginger, green cardamom.",
    category: "Drinks", station: "bar", priceCents: 9000, prepMinutes: 5,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 46,
    recipe: [{ ingredient: "Assam CTC tea", qty: 0.008 }, { ingredient: "Full cream milk", qty: 0.12 },
             { ingredient: "Ginger", qty: 0.004 }, { ingredient: "Sugar", qty: 0.012 }] },
  { name: "Mango lassi", description: "Alphonso pulp, thick dahi.",
    category: "Drinks", station: "bar", priceCents: 18000, prepMinutes: 3,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 30,
    recipe: [{ ingredient: "Alphonso mango pulp", qty: 0.09 }, { ingredient: "Dahi (curd)", qty: 0.14 },
             { ingredient: "Sugar", qty: 0.01 }] },
  { name: "Fresh lime soda", description: "Sweet or salted.",
    category: "Drinks", station: "bar", priceCents: 11000, prepMinutes: 2,
    allergens: [], tags: ["vegetarian", "vegan"], weight: 27,
    recipe: [{ ingredient: "Lemon", qty: 1 }, { ingredient: "Soda water", qty: 0.25 },
             { ingredient: "Sugar", qty: 0.01 }] },
  { name: "Kingfisher lager", description: "330ml, chilled.",
    category: "Drinks", station: "bar", priceCents: 25000, prepMinutes: 1,
    allergens: ["gluten"], tags: [], weight: 15,
    recipe: [{ ingredient: "Kingfisher lager", qty: 1 }] },
];

export const TABLES = [
  { label: "1", seats: 2, zone: "Window" }, { label: "2", seats: 4, zone: "Window" },
  { label: "3", seats: 2, zone: "Window" }, { label: "4", seats: 6, zone: "Window" },
  { label: "5", seats: 4, zone: "Main" },   { label: "6", seats: 4, zone: "Main" },
  { label: "7", seats: 2, zone: "Main" },   { label: "8", seats: 8, zone: "Main" },
  { label: "9", seats: 2, zone: "Main" },   { label: "10", seats: 4, zone: "Main" },
  { label: "B1", seats: 2, zone: "Bar" },   { label: "B2", seats: 2, zone: "Bar" },
];

/** Demo logins. Documented in docs/08-runbook.md. */
export const STAFF = [
  { email: "owner@brigade.test",   name: "Meera Kapoor",  role: "owner",   station: null },
  { email: "manager@brigade.test", name: "Tom Ellery",    role: "manager", station: null },
  { email: "grill@brigade.test",   name: "Rahul Desai",   role: "chef",    station: "grill" },
  { email: "saute@brigade.test",   name: "Ana Ferreira",  role: "chef",    station: "saute" },
  { email: "expo@brigade.test",    name: "Joss Bell",     role: "expo",    station: "pass" },
  { email: "server@brigade.test",  name: "Kit Nwosu",     role: "server",  station: null },
  { email: "host@brigade.test",    name: "Sofia Marín",   role: "host",    station: null },
] as const;

export const GUESTS = [
  { email: "priya@brigade.test", name: "Priya Shah",   allergens: ["nuts"] },
  { email: "dan@brigade.test",   name: "Dan Whitlock", allergens: [] },
  { email: "mei@brigade.test",   name: "Mei Tanaka",   allergens: ["shellfish"] },
] as const;

export const DEMO_PASSWORD = "brigade-demo-2026";

/**
 * Service windows. Lunch is quieter than dinner, weekends busier than weekdays.
 *
 * Continuous all-day service (no gap between lunch and dinner) for a demo-practical
 * reason: outside service hours the runway engine correctly suppresses predictions,
 * so a gap at 16:00 means a judge presenting mid-afternoon sees portion counts with
 * no predicted 86 times — the whole point of the board. All-day dining is perfectly
 * plausible, and this way the board is live whenever it's shown.
 *
 * The 16:00 boundary is load-bearing: it must match the lunch/dinner split the
 * velocity aggregation uses (h < 16 ? lunch : dinner), or a daypart ends up with no
 * velocity rows and every dish reports insufficientHistory.
 */
export const SERVICE_HOURS = {
  mon: [["12:00", "16:00"], ["16:00", "23:00"]],
  tue: [["12:00", "16:00"], ["16:00", "23:00"]],
  wed: [["12:00", "16:00"], ["16:00", "23:00"]],
  thu: [["12:00", "16:00"], ["16:00", "23:00"]],
  fri: [["12:00", "16:00"], ["16:00", "23:30"]],
  sat: [["12:00", "16:00"], ["16:00", "23:30"]],
  // Sunday now has an evening service too. It previously ran lunch only, which meant
  // no (sunday, dinner) velocity rows at all — and 26 July is a demo day.
  sun: [["12:00", "16:00"], ["16:00", "23:00"]],
};

/** Covers by weekday (0 = Sunday). Shapes the whole history. */
export const COVERS_BY_WEEKDAY = [132, 46, 52, 58, 74, 108, 146];
