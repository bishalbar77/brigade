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
  imageUrl: string | null;
  tags: string[];
  allergens: string[];
}

/**
 * Diet filters, from the `tags` the menu already carries.
 *
 * 19 of the 28 dishes are tagged `vegetarian` or `vegan`. The data was fetched, typed
 * on two interfaces, passed down — and never rendered. This is the whole feature:
 * showing what was already there.
 *
 * `vegan` implies `vegetarian` here, because a diner filtering for vegetarian food
 * does not mean "exclude the vegan dishes".
 */
const DIETS = [
  { key: "vegetarian", label: "Vegetarian", matches: ["vegetarian", "vegan"] },
  { key: "vegan", label: "Vegan", matches: ["vegan"] },
] as const;

type DietKey = (typeof DIETS)[number]["key"];

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
  const [diet, setDiet] = useState<DietKey | null>(null);
  const [query, setQuery] = useState("");

  const allergens = useMemo(() => allergensIn(dishes), [dishes]);
  const diets = useMemo(
    () => DIETS.filter((d) => dishes.some((dish) => dish.tags.includes(d.key))),
    [dishes],
  );

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
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const wanted = diet ? DIETS.find((d) => d.key === diet)!.matches : null;

    return withRunway.filter((d) => {
      if (excluded.size > 0 && d.allergens.some((a) => excluded.has(a))) return false;
      if (wanted && !wanted.some((t) => d.tags.includes(t))) return false;
      if (needle) {
        // Name and description both: "paneer" should find Palak paneer, and "creamy"
        // should find the dish whose description says so.
        const haystack = `${d.name} ${d.description}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [withRunway, excluded, diet, query]);

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

  function clearAll() {
    setExcluded(new Set());
    setDiet(null);
    setQuery("");
  }

  const hiddenCount = withRunway.length - visible.length;
  const filtering = excluded.size > 0 || diet !== null || query.trim() !== "";

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

      {/*
        Find a dish. 28 dishes across 8 categories was a single scroll with no way
        through it but the thumb.

        A plain client-side filter over the list already in memory — no debounce, no
        request. `type="search"` so a phone keyboard offers the right key and iOS draws
        its own clear button.
      */}
      <section style={{ marginBottom: "var(--space-4)" }}>
        <label className="eyebrow" htmlFor="dish-search">
          Find a dish
        </label>
        <input
          id="dish-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="paneer, biryani, something creamy…"
          autoComplete="off"
          style={{
            width: "100%",
            minHeight: "48px",
            marginTop: "var(--space-2)",
            padding: "0 var(--space-4)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border-strong)",
            background: "var(--color-bg-sunken)",
            color: "var(--color-fg)",
            font: "inherit",
            fontSize: "var(--text-step-0)",
          }}
        />
      </section>

      {diets.length > 0 && (
        <section style={{ marginBottom: "var(--space-4)" }}>
          <p className="eyebrow" id="diet-label">
            Show only
          </p>
          <div
            role="group"
            aria-labelledby="diet-label"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2)",
              marginTop: "var(--space-2)",
            }}
          >
            {diets.map((d) => {
              const on = diet === d.key;
              return (
                <Chip
                  key={d.key}
                  on={on}
                  // Tapping the active one turns it off — a filter you cannot undo
                  // without reloading is a trap.
                  onClick={() => setDiet(on ? null : d.key)}
                >
                  {d.label}
                </Chip>
              );
            })}
          </div>
        </section>
      )}

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
            {allergens.map((a) => (
              <Chip key={a} on={excluded.has(a)} onClick={() => toggle(a)}>
                {a}
              </Chip>
            ))}
          </div>
          {hiddenCount > 0 && (
            <p
              className="eyebrow"
              style={{ marginTop: "var(--space-2)", color: "var(--color-fg-muted)" }}
            >
              {hiddenCount} dish{hiddenCount === 1 ? "" : "es"} hidden
              {filtering && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={clearAll}
                    style={{
                      border: "none",
                      background: "none",
                      padding: 0,
                      font: "inherit",
                      color: "var(--color-accent)",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    show everything
                  </button>
                </>
              )}
            </p>
          )}
        </section>
      )}

      {/*
        Jump to a course.

        Sticks just below the guest header — `--guest-header-h` is pinned on that
        header for exactly this reason, so the two cannot drift. Plain anchors, so it
        works before hydration and the browser handles the scrolling.

        Only categories that survived the filters are listed: an entry that scrolls to
        nothing is worse than no entry.
      */}
      {grouped.length > 1 && (
        <nav
          aria-label="Jump to a course"
          className="scroll-x"
          style={{
            position: "sticky",
            top: "var(--guest-header-h)",
            zIndex: 10,
            display: "flex",
            gap: "var(--space-2)",
            marginBottom: "var(--space-5)",
            // Symmetric padding so the chips don't touch the header's bottom edge when
            // the strip pins beneath it — without it they read as clipped.
            padding: "var(--space-2) 0",
            // Opaque enough that cards scrolling underneath don't muddle the labels.
            background: "color-mix(in oklab, var(--color-bg) 92%, transparent)",
            backdropFilter: "blur(8px)",
          }}
        >
          {grouped.map((cat) => (
            <a
              key={cat.id}
              href={`#cat-${cat.id}`}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                minHeight: "40px",
                padding: "0 var(--space-3)",
                borderRadius: "999px",
                border: "1px solid var(--color-border)",
                color: "var(--color-fg-muted)",
                fontSize: "var(--text-step--1)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {cat.name}
            </a>
          ))}
        </nav>
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
            {query.trim()
              ? `Nothing on tonight's menu matches “${query.trim()}”.`
              : "Nothing on the menu matches those filters."}
          </p>
          <button
            type="button"
            onClick={clearAll}
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
          <section
            key={cat.id}
            id={`cat-${cat.id}`}
            style={{
              marginBottom: "var(--space-6)",
              // Both sticky bars clear the heading a jump lands on, or the anchor
              // arrives underneath them and looks like it went nowhere.
              scrollMarginTop: "calc(var(--guest-header-h) + 3.5rem)",
            }}
          >
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
                <MenuCard
                  key={dish.id}
                  dish={{ ...dish, categoryName: cat.name }}
                  flash={changed.has(dish.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** A filter chip. `aria-pressed` is what makes it a toggle rather than a link. */
function Chip({
  children,
  on,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
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
      {children}
    </button>
  );
}
