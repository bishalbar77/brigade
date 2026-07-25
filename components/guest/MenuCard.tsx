import Link from "next/link";
import { RunwayMeter } from "@/components/runway/RunwayMeter";
import { formatCents } from "@/lib/money";
import type { RunwayResult } from "@/lib/runway/types";

/*
 * One dish on the guest menu.
 *
 * The four runway bands are rendered as four visibly different states, and none of
 * them relies on colour alone — 86 is struck through AND labelled, critical carries
 * a glyph AND a time. See docs/features/digital-menu.md.
 */

export interface MenuCardDish {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  tags: string[];
  allergens: string[];
  runway: RunwayResult;
}

export function MenuCard({
  dish,
  flash = false,
}: {
  dish: MenuCardDish;
  /** Just changed over realtime — mark it, briefly. */
  flash?: boolean;
}) {
  const out = dish.runway.band === "out";

  return (
    <li
      data-flash={flash || undefined}
      style={{
        listStyle: "none",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-raised)",
        overflow: "hidden",
        opacity: out ? 0.62 : 1,
        transition: "opacity var(--dur-base) var(--ease-out-brigade)",
      }}
    >
      <Link
        href={out ? "/menu" : `/menu/${dish.id}`}
        aria-disabled={out || undefined}
        style={{
          display: "block",
          padding: "var(--space-4)",
          color: "inherit",
          textDecoration: "none",
          pointerEvents: out ? "none" : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--space-4)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "var(--text-step-1)",
              letterSpacing: "-0.01em",
              textDecoration: out ? "line-through" : "none",
              textDecorationThickness: "2px",
            }}
          >
            {dish.name}
          </h3>
          <p
            className="mono"
            style={{
              flexShrink: 0,
              fontSize: "var(--text-step-0)",
              color: out ? "var(--color-fg-subtle)" : "var(--color-fg)",
              textDecoration: out ? "line-through" : "none",
            }}
          >
            {formatCents(dish.priceCents)}
          </p>
        </div>

        {dish.description && (
          <p
            style={{
              marginTop: "var(--space-2)",
              color: "var(--color-fg-muted)",
              fontSize: "var(--text-step-0)",
            }}
          >
            {dish.description}
          </p>
        )}

        <div
          style={{
            marginTop: "var(--space-3)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          {/* plenty renders nothing here — an unremarkable dish needs no badge. */}
          <RunwayMeter runway={dish.runway} />

          {dish.allergens.length > 0 && (
            <p className="eyebrow" style={{ textAlign: "right" }}>
              {dish.allergens.join(" · ")}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
