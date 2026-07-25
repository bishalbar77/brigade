/**
 * Seed reference data: a plausible modern British restaurant.
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
  { name: "Coast & Quay Fish", contact: "orders@coastquay.test", leadTimeDays: 2 },
  { name: "Fell Farm Meats", contact: "sales@fellfarm.test", leadTimeDays: 1 },
  { name: "Green Row Produce", contact: "hello@greenrow.test", leadTimeDays: 1 },
  { name: "Mill Lane Dairy", contact: "orders@milllane.test", leadTimeDays: 1 },
  { name: "Dry Goods Co", contact: "trade@drygoods.test", leadTimeDays: 3 },
];

export const INGREDIENTS: SeedIngredient[] = [
  // fish — short shelf life, expensive, the usual binding constraint
  { name: "Sea bass fillet", unit: "ea", costPerUnitCents: 420, parLevel: 30, shelfLifeDays: 2, supplier: "Coast & Quay Fish" },
  { name: "King scallops", unit: "ea", costPerUnitCents: 180, parLevel: 60, shelfLifeDays: 2, supplier: "Coast & Quay Fish" },
  { name: "Smoked haddock", unit: "kg", costPerUnitCents: 1650, parLevel: 8, shelfLifeDays: 3, supplier: "Coast & Quay Fish" },
  { name: "Cured salmon", unit: "kg", costPerUnitCents: 2400, parLevel: 4, shelfLifeDays: 5, supplier: "Coast & Quay Fish" },

  // meat
  { name: "Lamb rump", unit: "kg", costPerUnitCents: 2200, parLevel: 20, shelfLifeDays: 4, supplier: "Fell Farm Meats" },
  { name: "Beef sirloin", unit: "kg", costPerUnitCents: 3100, parLevel: 16, shelfLifeDays: 4, supplier: "Fell Farm Meats" },
  { name: "Chicken thigh", unit: "kg", costPerUnitCents: 780, parLevel: 18, shelfLifeDays: 3, supplier: "Fell Farm Meats" },
  { name: "Pork belly", unit: "kg", costPerUnitCents: 1150, parLevel: 12, shelfLifeDays: 4, supplier: "Fell Farm Meats" },
  { name: "Beef bones", unit: "kg", costPerUnitCents: 320, parLevel: 20, shelfLifeDays: 5, supplier: "Fell Farm Meats" },

  // produce
  { name: "Fennel", unit: "kg", costPerUnitCents: 280, parLevel: 10, shelfLifeDays: 7, supplier: "Green Row Produce" },
  { name: "Lemon", unit: "ea", costPerUnitCents: 30, parLevel: 80, shelfLifeDays: 14, supplier: "Green Row Produce" },
  { name: "Heritage tomato", unit: "kg", costPerUnitCents: 620, parLevel: 12, shelfLifeDays: 5, supplier: "Green Row Produce" },
  { name: "New potato", unit: "kg", costPerUnitCents: 190, parLevel: 30, shelfLifeDays: 10, supplier: "Green Row Produce" },
  { name: "Purple sprouting broccoli", unit: "kg", costPerUnitCents: 540, parLevel: 8, shelfLifeDays: 5, supplier: "Green Row Produce" },
  { name: "Wild garlic", unit: "kg", costPerUnitCents: 1400, parLevel: 3, shelfLifeDays: 3, supplier: "Green Row Produce" },
  { name: "Shallot", unit: "kg", costPerUnitCents: 260, parLevel: 12, shelfLifeDays: 21, supplier: "Green Row Produce" },
  { name: "Chestnut mushroom", unit: "kg", costPerUnitCents: 460, parLevel: 10, shelfLifeDays: 6, supplier: "Green Row Produce" },
  { name: "Rhubarb", unit: "kg", costPerUnitCents: 480, parLevel: 6, shelfLifeDays: 7, supplier: "Green Row Produce" },
  { name: "Cavolo nero", unit: "kg", costPerUnitCents: 420, parLevel: 6, shelfLifeDays: 5, supplier: "Green Row Produce" },
  { name: "Jersey Royals", unit: "kg", costPerUnitCents: 640, parLevel: 10, shelfLifeDays: 6, supplier: "Green Row Produce" },

  // dairy
  { name: "Butter", unit: "kg", costPerUnitCents: 700, parLevel: 20, shelfLifeDays: 21, supplier: "Mill Lane Dairy" },
  { name: "Double cream", unit: "L", costPerUnitCents: 320, parLevel: 12, shelfLifeDays: 7, supplier: "Mill Lane Dairy" },
  { name: "Whole milk", unit: "L", costPerUnitCents: 140, parLevel: 20, shelfLifeDays: 7, supplier: "Mill Lane Dairy" },
  { name: "Aged cheddar", unit: "kg", costPerUnitCents: 1900, parLevel: 5, shelfLifeDays: 30, supplier: "Mill Lane Dairy" },
  { name: "Free range egg", unit: "ea", costPerUnitCents: 38, parLevel: 120, shelfLifeDays: 21, supplier: "Mill Lane Dairy" },
  { name: "Creme fraiche", unit: "L", costPerUnitCents: 420, parLevel: 6, shelfLifeDays: 10, supplier: "Mill Lane Dairy" },

  // dry & bar
  { name: "Plain flour", unit: "kg", costPerUnitCents: 120, parLevel: 25, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Caster sugar", unit: "kg", costPerUnitCents: 130, parLevel: 20, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Pearl barley", unit: "kg", costPerUnitCents: 240, parLevel: 10, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Rapeseed oil", unit: "L", costPerUnitCents: 380, parLevel: 15, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Dark chocolate 70%", unit: "kg", costPerUnitCents: 1650, parLevel: 6, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Sourdough loaf", unit: "ea", costPerUnitCents: 260, parLevel: 20, shelfLifeDays: 2, supplier: "Dry Goods Co" },
  { name: "Hazelnut", unit: "kg", costPerUnitCents: 1420, parLevel: 4, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Gin", unit: "L", costPerUnitCents: 2200, parLevel: 6, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Tonic", unit: "L", costPerUnitCents: 180, parLevel: 12, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Red wine", unit: "L", costPerUnitCents: 900, parLevel: 20, shelfLifeDays: null, supplier: "Dry Goods Co" },
  { name: "Vermouth", unit: "L", costPerUnitCents: 1400, parLevel: 4, shelfLifeDays: null, supplier: "Dry Goods Co" },
];

export const CATEGORIES = ["Snacks", "Starters", "Mains", "Sides", "Puddings", "Drinks"];

export const DISHES: SeedDish[] = [
  // ---- Snacks
  { name: "Sourdough & cultured butter", description: "Baked in house, salted butter.",
    category: "Snacks", station: "larder", priceCents: 550, prepMinutes: 3,
    allergens: ["gluten", "dairy"], tags: ["vegetarian"], weight: 30,
    recipe: [{ ingredient: "Sourdough loaf", qty: 0.25 }, { ingredient: "Butter", qty: 0.03 }] },
  { name: "Cheddar & onion croquettes", description: "Aged cheddar, caramelised shallot.",
    category: "Snacks", station: "saute", priceCents: 750, prepMinutes: 6,
    allergens: ["gluten", "dairy", "egg"], tags: ["vegetarian"], weight: 16,
    recipe: [{ ingredient: "Aged cheddar", qty: 0.05 }, { ingredient: "Shallot", qty: 0.04 },
             { ingredient: "Plain flour", qty: 0.03 }, { ingredient: "Free range egg", qty: 0.5 },
             { ingredient: "Rapeseed oil", qty: 0.02 }] },

  // ---- Starters
  { name: "Cured salmon, creme fraiche", description: "Beetroot-cured, dill oil.",
    category: "Starters", station: "larder", priceCents: 1150, prepMinutes: 5,
    allergens: ["fish", "dairy"], tags: [], weight: 14,
    recipe: [{ ingredient: "Cured salmon", qty: 0.08 }, { ingredient: "Creme fraiche", qty: 0.03 },
             { ingredient: "Lemon", qty: 0.25 }] },
  { name: "Scallops, wild garlic butter", description: "Hand-dived, seared hard.",
    category: "Starters", station: "grill", priceCents: 1450, prepMinutes: 8,
    allergens: ["shellfish", "dairy"], tags: [], weight: 11,
    recipe: [{ ingredient: "King scallops", qty: 3 }, { ingredient: "Wild garlic", qty: 0.02 },
             { ingredient: "Butter", qty: 0.03 }, { ingredient: "Lemon", qty: 0.25 }] },
  { name: "Smoked haddock chowder", description: "Barley, leek, soft egg.",
    category: "Starters", station: "saute", priceCents: 1050, prepMinutes: 7,
    allergens: ["fish", "dairy", "egg"], tags: [], weight: 9,
    recipe: [{ ingredient: "Smoked haddock", qty: 0.09 }, { ingredient: "Pearl barley", qty: 0.04 },
             { ingredient: "Whole milk", qty: 0.12 }, { ingredient: "Free range egg", qty: 1 },
             { ingredient: "Butter", qty: 0.02 }] },
  { name: "Heritage tomato salad", description: "Aged sherry dressing, basil.",
    category: "Starters", station: "larder", priceCents: 950, prepMinutes: 4,
    allergens: [], tags: ["vegetarian", "vegan"], weight: 7,
    recipe: [{ ingredient: "Heritage tomato", qty: 0.18 }, { ingredient: "Rapeseed oil", qty: 0.02 }] },

  // ---- Mains — the branzino is the demo dish: expensive, short shelf life
  { name: "Sea bass, fennel & lemon", description: "Whole fillet, braised fennel.",
    category: "Mains", station: "grill", priceCents: 1900, prepMinutes: 14,
    allergens: ["fish"], tags: [], weight: 18,
    recipe: [{ ingredient: "Sea bass fillet", qty: 1 }, { ingredient: "Fennel", qty: 0.15 },
             { ingredient: "Lemon", qty: 0.5 }, { ingredient: "Butter", qty: 0.03 }] },
  { name: "Lamb rump, cavolo nero", description: "Pink, bone jus, wild garlic.",
    category: "Mains", station: "grill", priceCents: 2400, prepMinutes: 18,
    allergens: [], tags: [], weight: 15,
    recipe: [{ ingredient: "Lamb rump", qty: 0.22 }, { ingredient: "Cavolo nero", qty: 0.08 },
             { ingredient: "Beef bones", qty: 0.1 }, { ingredient: "Butter", qty: 0.02 }] },
  { name: "Sirloin, peppercorn butter", description: "35-day dry aged.",
    category: "Mains", station: "grill", priceCents: 2900, prepMinutes: 16,
    allergens: ["dairy"], tags: [], weight: 12,
    recipe: [{ ingredient: "Beef sirloin", qty: 0.25 }, { ingredient: "Butter", qty: 0.04 },
             { ingredient: "New potato", qty: 0.15 }] },
  { name: "Buttermilk chicken thigh", description: "Brined overnight, mushroom cream.",
    category: "Mains", station: "saute", priceCents: 1650, prepMinutes: 15,
    allergens: ["dairy"], tags: [], weight: 20,
    recipe: [{ ingredient: "Chicken thigh", qty: 0.24 }, { ingredient: "Chestnut mushroom", qty: 0.08 },
             { ingredient: "Double cream", qty: 0.05 }, { ingredient: "Whole milk", qty: 0.08 }] },
  { name: "Pork belly, rhubarb", description: "Slow cooked, crackling, sharp rhubarb.",
    category: "Mains", station: "saute", priceCents: 1850, prepMinutes: 17,
    allergens: [], tags: [], weight: 8,
    recipe: [{ ingredient: "Pork belly", qty: 0.26 }, { ingredient: "Rhubarb", qty: 0.09 },
             { ingredient: "Shallot", qty: 0.04 }] },
  // deliberate Dog: low weight, thin margin — the matrix needs one
  { name: "Barley & mushroom risotto", description: "Pearl barley, aged cheddar.",
    category: "Mains", station: "saute", priceCents: 1400, prepMinutes: 16,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 4,
    recipe: [{ ingredient: "Pearl barley", qty: 0.09 }, { ingredient: "Chestnut mushroom", qty: 0.12 },
             { ingredient: "Aged cheddar", qty: 0.05 }, { ingredient: "Double cream", qty: 0.06 },
             { ingredient: "Butter", qty: 0.04 }] },

  // ---- Sides — high margin, low popularity = Puzzles
  { name: "Jersey Royals, mint butter", description: "",
    category: "Sides", station: "saute", priceCents: 550, prepMinutes: 6,
    allergens: ["dairy"], tags: ["vegetarian"], weight: 10,
    recipe: [{ ingredient: "Jersey Royals", qty: 0.16 }, { ingredient: "Butter", qty: 0.02 }] },
  { name: "Purple sprouting broccoli", description: "Chilli, lemon.",
    category: "Sides", station: "saute", priceCents: 500, prepMinutes: 5,
    allergens: [], tags: ["vegetarian", "vegan"], weight: 6,
    recipe: [{ ingredient: "Purple sprouting broccoli", qty: 0.14 }, { ingredient: "Lemon", qty: 0.25 },
             { ingredient: "Rapeseed oil", qty: 0.01 }] },

  // ---- Puddings
  { name: "Dark chocolate & hazelnut tart", description: "70% chocolate, salted hazelnut.",
    category: "Puddings", station: "pastry", priceCents: 950, prepMinutes: 5,
    allergens: ["gluten", "dairy", "nuts", "egg"], tags: ["vegetarian"], weight: 13,
    recipe: [{ ingredient: "Dark chocolate 70%", qty: 0.06 }, { ingredient: "Hazelnut", qty: 0.03 },
             { ingredient: "Plain flour", qty: 0.05 }, { ingredient: "Butter", qty: 0.05 },
             { ingredient: "Free range egg", qty: 1 }, { ingredient: "Caster sugar", qty: 0.04 }] },
  { name: "Rhubarb & custard", description: "Poached rhubarb, vanilla custard.",
    category: "Puddings", station: "pastry", priceCents: 850, prepMinutes: 4,
    allergens: ["dairy", "egg"], tags: ["vegetarian"], weight: 9,
    recipe: [{ ingredient: "Rhubarb", qty: 0.12 }, { ingredient: "Double cream", qty: 0.08 },
             { ingredient: "Free range egg", qty: 1 }, { ingredient: "Caster sugar", qty: 0.05 }] },
  { name: "Custard tart", description: "Nutmeg, all-butter pastry.",
    category: "Puddings", station: "pastry", priceCents: 800, prepMinutes: 4,
    allergens: ["gluten", "dairy", "egg"], tags: ["vegetarian"], weight: 5,
    recipe: [{ ingredient: "Plain flour", qty: 0.05 }, { ingredient: "Butter", qty: 0.04 },
             { ingredient: "Double cream", qty: 0.07 }, { ingredient: "Free range egg", qty: 2 },
             { ingredient: "Caster sugar", qty: 0.04 }] },

  // ---- Drinks — Stars: cheap to make, sell constantly
  { name: "House G&T", description: "London dry, citrus tonic.",
    category: "Drinks", station: "bar", priceCents: 950, prepMinutes: 2,
    allergens: [], tags: ["vegan"], weight: 22,
    recipe: [{ ingredient: "Gin", qty: 0.05 }, { ingredient: "Tonic", qty: 0.15 },
             { ingredient: "Lemon", qty: 0.15 }] },
  { name: "Red wine, glass", description: "Rotating by the glass.",
    category: "Drinks", station: "bar", priceCents: 900, prepMinutes: 1,
    allergens: ["sulphites"], tags: ["vegan"], weight: 26,
    recipe: [{ ingredient: "Red wine", qty: 0.175 }] },
  { name: "Vermouth spritz", description: "Sweet vermouth, soda, orange.",
    category: "Drinks", station: "bar", priceCents: 850, prepMinutes: 2,
    allergens: ["sulphites"], tags: ["vegan"], weight: 7,
    recipe: [{ ingredient: "Vermouth", qty: 0.06 }, { ingredient: "Tonic", qty: 0.1 }] },
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

/** Service windows. Lunch is quieter than dinner, weekends busier than weekdays. */
export const SERVICE_HOURS = {
  mon: [["12:00", "15:00"], ["18:00", "22:30"]],
  tue: [["12:00", "15:00"], ["18:00", "22:30"]],
  wed: [["12:00", "15:00"], ["18:00", "22:30"]],
  thu: [["12:00", "15:00"], ["18:00", "22:30"]],
  fri: [["12:00", "15:00"], ["18:00", "23:00"]],
  sat: [["12:00", "15:30"], ["17:30", "23:00"]],
  sun: [["12:00", "16:00"]],
};

/** Covers by weekday (0 = Sunday). Shapes the whole history. */
export const COVERS_BY_WEEKDAY = [72, 38, 44, 52, 64, 98, 118];
