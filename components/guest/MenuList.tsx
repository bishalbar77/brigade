"use client";

import { useMemo, useState } from "react";
import { MenuCard, type MenuCardDish } from "@/components/guest/MenuCard";
import { useAvailability, type Availability } from "@/lib/hooks/useAvailability";
import { runwayFromPortions } from "@/lib/runway/runway";
import { scoreForSteering } from "@/lib/runway/steering";
import type { Velocity } from "@/lib/runway/types";
import type { DaypartWindow } from "@/lib/runway/velocity";

/*
 * The live menu.
 *
 * Runway is recomputed here from portions using the same tested engine the server
 * and the ops surfaces use (`runwayFromPortions`), so a realtime portion change
 * produces a correctly-banded result without a round trip and without a second
 * implementation of the rules.
 *
 * Steering drops the margin term on this path — a guest cannot read cost. See the
 * note on `orderForGuest` in lib/data/menu.ts. Ordering is within category only:
 * a menu that reorders across starters and mains is unusable.
 */

export interface MenuListDish {
  id: string;
  categoryId: string | null;
  name: string;
  description: string;
  priceCents: number;
  tags: string[];
  allergens: string[];
}

export interface MenuListProps {
  restaurantId: string;
  dishes: MenuListDish[];
  categories: { id: string; name: string }[];
  initialAvailability: Record<string, Availability>;
  velocityByDish: Record<string, Velocity>;
  serviceWindows: DaypartWindow[];
  globalMeanVelocity: number;
}

/** Allergens offered as filters — only those the menu actually declares. */
function allergensIn(dishes: readonly MenuListDish[]): string[] {
  return [...new Set(dishes.flatMap((d) => d.allergens))].sort();
}

export function MenuList({
  restaurantId,
  dishes,
  categories,
  initialAvailability,
  velocityByDish,
  serviceWindows,
  globalMeanVelocity,
}: MenuListProps) {
  const { availability, changed, live } = useAvailability(restaurantId, initialAvailability);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  const allergens = useMemo(() => allergensIn(dishes), [dishes]);

  // MenuCardDish plus categoryId, since grouping happens here rather than in the card.
  const withRunway: (MenuListDish & Pick<MenuCardDish, "runway">)[] = useMemo(() => {
    const now = new Date();
    return dishes.map((d) => {
      const avail = availability[d.id];
      return {
        ...d,
        runway: runwayFromPortions({
          dishId: d.id,
          portions: avail?.portions ?? 0,
          manually86: avail?.manually86 ?? false,
          velocity: velocityByDish[d.id],
          globalMeanVelocity,
          serviceWindows,
          now,
        }),
      };
    });
  }, [dishes, availability, velocityByDish, serviceWindows, globalMeanVelocity]);

  /*
   * Allergen filtering is a HARD EXCLUSION, never a ranking penalty. Ranking down
   * an allergen is a safety bug, not a tuning choice.
   */
  const visible = useMemo(
    () =>
      excluded.size === 0
        ? withRunway
        : withRunway.filter((d) => !d.allergens.some((a) => excluded.has(a))),
    [withRunway, excluded],
  );

  const grouped = useMemo(() => {
    return categories
      .map((cat) => {
        const inCat = visible.filter((d) => d.categoryId === cat.id);
        // Steering sorts WITHIN a category, never across.
        const ranked = scoreForSteering(
          inCat.map((d) => ({ dishId: d.id, marginCents: 0, runway: d.runway, affinity: 0 })),
        );
        const order = new Map(ranked.map((r, i) => [r.dishId, i]));
        return {
          ...cat,
          dishes: [...inCat].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
        };
      })
      // An empty category is hidden entirely rather than shown empty.
      .filter((c) => c.dishes.length > 0);
  }, [categories, visible]);

  const toggle = (allergen: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(allergen)) next.delete(allergen);
      else next.add(allergen);
      return next;
    });

  const hiddenCount = withRunway.length - visible.length;

  return (
    <div style={{ padding: "var(--space-5) var(--space-4) var(--space-8)" }}>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          <h1 style={{ fontSize: "var(--text-step-3)" }}>Tonight</h1>
          {/* Honest about the connection: if live updates are down, don't imply
              the counts are moving. */}
          <p className="eyebrow" title={live ? "Updating live" : "Reconnecting"}>
            {live ? "live" : "reconnecting"}
          </p>
        </div>
        <p style={{ color: "var(--color-fg-muted)", marginTop: "var(--space-2)" }}>
          Counts come from the kitchen&rsquo;s stock, so they change as other tables order.
        </p>
      </header>

      {allergens.length > 0 && (
        <section style={{ marginBottom: "var(--space-5)" }}>
          <p className="eyebrow" id="allergen-label">
            Hide dishes containing
          </p>
          <div
            role="group"
            aria-labelledby="allergen-label"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2)",
              marginTop: "var(--space-2)",
            }}
          >
            {allergens.map((a) => {
              const on = excluded.has(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(a)}
                  style={{
                    padding: "0 var(--space-4)",
                    borderRadius: "999px",
                    border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border-strong)"}`,
                    background: on ? "var(--color-accent)" : "transparent",
                    color: on ? "var(--color-accent-fg)" : "var(--color-fg-muted)",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {on ? "✓ " : ""}
                  {a}
                </button>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <p
              className="eyebrow"
              style={{ marginTop: "var(--space-2)", color: "var(--color-fg-muted)" }}
            >
              {hiddenCount} dish{hiddenCount === 1 ? "" : "es"} hidden
            </p>
          )}
        </section>
      )}

      {grouped.length === 0 ? (
        /* Designed empty state, not a blank panel. It says what to do next. */
        <div
          style={{
            border: "1px dashed var(--color-border-strong)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-6)",
            textAlign: "center",
          }}
        >
          <p style={{ marginBottom: "var(--space-3)" }}>
            Nothing on the menu matches those filters.
          </p>
          <button
            type="button"
            onClick={() => setExcluded(new Set())}
            style={{
              padding: "0 var(--space-5)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              background: "transparent",
              color: "var(--color-fg)",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        grouped.map((cat) => (
          <section key={cat.id} style={{ marginBottom: "var(--space-6)" }}>
            <h2
              style={{
                fontSize: "var(--text-step-1)",
                marginBottom: "var(--space-3)",
                paddingBottom: "var(--space-2)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {cat.name}
            </h2>
            <ul style={{ display: "grid", gap: "var(--space-3)", padding: 0, margin: 0 }}>
              {cat.dishes.map((dish) => (
                <MenuCard key={dish.id} dish={dish} flash={changed.has(dish.id)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
