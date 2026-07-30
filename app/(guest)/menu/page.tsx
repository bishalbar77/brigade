import { MenuList } from "@/components/guest/MenuList";
import { getMenuWithRunway } from "@/lib/data/menu";
import type { Availability } from "@/lib/hooks/useAvailability";

/*
 * The live menu — where Brigade stops being a Toast clone.
 *
 * Toast computes this availability number and shows it on the POS and the kitchen
 * screen. Putting it in front of the person actually choosing is the differentiator.
 *
 * Public: no account needed to browse, so availability reaches a guest before any
 * friction at all. Ordering is what's gated — see spec decision D2.
 */

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const menu = await getMenuWithRunway();

  const initialAvailability: Record<string, Availability> = Object.fromEntries(
    menu.dishes.map((d) => [
      d.id,
      {
        portions: d.runway.portions,
        manually86: d.manually86,
        unlimited: d.runway.unlimited,
      },
    ]),
  );

  const rates = Object.values(menu.velocityByDish)
    .map((v) => v.unitsPerHour)
    .filter((r) => r > 0);
  const globalMeanVelocity = rates.length
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : 0;

  return (
    <MenuList
      restaurantId={menu.restaurantId}
      dishes={menu.dishes.map((d) => ({
        id: d.id,
        categoryId: d.categoryId,
        name: d.name,
        description: d.description,
        priceCents: d.priceCents,
        imageUrl: d.imageUrl,
        tags: d.tags,
        allergens: d.allergens,
      }))}
      categories={menu.categories.map((c) => ({ id: c.id, name: c.name }))}
      initialAvailability={initialAvailability}
      velocityByDish={menu.velocityByDish}
      serviceWindows={menu.serviceWindows}
      globalMeanVelocity={globalMeanVelocity}
    />
  );
}
