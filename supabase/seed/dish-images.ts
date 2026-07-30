/**
 * Dish photography: a CURATED map of dish name → Wikimedia Commons file title.
 *
 * Curated, not searched. A live search per dish at seed time would make the menu's
 * appearance nondeterministic and is exactly how a photo of a salad ends up on the
 * biryani. Every entry below was checked by eye against the Commons search results:
 * it is a photo OF the named dish, and it carries a named author and an explicit
 * licence (verified — see docs/image-credits.md, which scripts/fetch-dish-images.ts
 * writes from the API rather than from this file).
 *
 * Two entries deserve a note, because the obvious search hit was wrong:
 *  - Gulab jamun: the top result is `File:KalaJamoon.JPG`, which is KALA jamun — a
 *    different, darker sweet. Using the correctly-named photo instead.
 *  - Kadai prawns: Commons has exactly one photo of the dish. It's a good one.
 *
 * Landscape sources are preferred, since the card crops to 16:9. Where Commons only
 * has portrait (mango lassi, lime soda, paneer butter masala) the crop takes the
 * middle, which for a glass or a bowl is the part you want anyway.
 *
 * The files are RE-HOSTED in Supabase Storage, never hotlinked, so the running app
 * never depends on Commons being reachable. See scripts/fetch-dish-images.ts.
 */

/** Public Storage bucket the photos are re-hosted in. */
export const IMAGE_BUCKET = "dish-images";

export const DISH_IMAGES: Readonly<Record<string, string>> = {
  // Chaat
  "Papdi chaat": "File:Papdi-chaat.jpg",
  "Punjabi samosa": "File:Samosa with chutney.jpg",
  "Dahi puri": "File:Dahi Puri by Jai Ambe Chaat Bhandaar in Bhopal Madhya Pradesh.jpg",
  // Tandoor
  "Murgh malai tikka": "File:Chicken Malai Tikka.JPG",
  "Paneer tikka": "File:Panir Tikka Indian cheese grilled.jpg",
  "Mutton seekh kebab": "File:Seekh Kebabs on Fire.JPG",
  "Tandoori prawns": "File:Tandoori Prawn - Hotel Lindsay - Kolkata - FILE 0008.jpg",
  // Curries
  "Butter chicken": "File:Chicken makhani.jpg",
  "Dal makhani": "File:Dal Makhani..JPG",
  "Paneer butter masala": "File:Paneer butter masala 3.jpg",
  "Rogan josh": "File:Mutton rogan josh.jpg",
  "Palak paneer": "File:Palak Paneer curry on plate.jpg",
  "Kadai prawns": "File:Prawns Masala.jpg",
  // Biryani & Rice
  "Hyderabadi mutton biryani": "File:Hyderabadi Biryani 2.jpg",
  "Chicken dum biryani": "File:Dum Biryani Plate.jpg",
  "Jeera rice": "File:Jeera rice.jpg",
  // Breads
  "Butter naan": "File:Butter Naan 2.jpg",
  "Garlic naan": "File:Garlic naan 1.jpg",
  "Laccha paratha": "File:Lachha-paratha.jpg",
  // Sides
  "Boondi raita": "File:Boondi Raita.JPG",
  "Masala papad": "File:Onion Masala Papad.jpg",
  // Mithai
  "Gulab jamun": "File:Two Gulab Jamun in a plate 01.jpg",
  "Gajar ka halwa": "File:Delicious Gajar Ka Halwa.jpg",
  "Kulfi falooda": "File:Falooda kulfi from India.jpg",
  // Drinks
  "Masala chai": "File:Masala Chai.JPG",
  "Mango lassi": "File:Mango lassi at restaurant Momo & More in March 2024.jpg",
  "Fresh lime soda": "File:Neemboo-Paani (Lime Water).JPG",
  "Kingfisher lager": "File:Kingfisher beer bottle.jpg",
};

/**
 * Storage object path for a dish, derived from its name.
 *
 * Deterministic on purpose: `npm run seed` truncates and rebuilds `dishes`, which
 * would drop `image_url` every time. Because the path is a pure function of the name,
 * the seed can restore the URL for any object already in the bucket without going
 * near Commons — and, critically, only for objects that are actually THERE, so a
 * missing photo is a gradient rather than a broken image.
 */
export function imageObjectPath(dishName: string): string {
  return `${slugify(dishName)}.jpg`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
