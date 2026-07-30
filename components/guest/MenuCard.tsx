"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DishImage } from "@/components/guest/DishImage";
import { RunwayMeter } from "@/components/runway/RunwayMeter";
import { addLine, readCart, writeCart } from "@/lib/cart";
import { formatCents } from "@/lib/money";
import type { RunwayResult } from "@/lib/runway/types";

/*
 * One dish on the guest menu.
 *
 * The four runway bands are rendered as four visibly different states, and none of
 * them relies on colour alone — 86 is struck through AND labelled, critical carries
 * a glyph AND a time. See docs/features/digital-menu.md.
 *
 * WHY THIS IS NO LONGER ONE BIG LINK. Adding a dish used to cost two taps: the whole
 * card navigated to the detail page, and the only add control lived there. A second
 * dish cost three more. The fix is an add button in the card — and a button cannot be
 * nested inside an anchor, so the card is now a link (photo, name, price, description)
 * with a sibling footer holding the meter and the button. The link still covers the
 * large majority of the card, so the "tell me more" tap target did not shrink.
 *
 * A SOLD-OUT CARD IS NOT FOCUSABLE. It used to keep `href="/menu"` with
 * `pointerEvents: "none"`, which stops a mouse and does nothing at all to a keyboard:
 * the card still took a tab stop and Enter still navigated. Now it renders a plain
 * div, so there is nothing to focus.
 */

export interface MenuCardDish {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  /** For the stand-in when there is no photo, and nothing else. */
  categoryName?: string | null;
  tags: string[];
  allergens: string[];
  runway: RunwayResult;
}

/** How long "Added" stays on the button before it invites another tap. */
const ADDED_MS = 1600;

export function MenuCard({
  dish,
  flash = false,
}: {
  dish: MenuCardDish;
  /** Just changed over realtime — mark it, briefly. */
  flash?: boolean;
}) {
  const out = dish.runway.band === "out";
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function add() {
    writeCart(
      addLine(readCart(), {
        dishId: dish.id,
        name: dish.name,
        unitPriceCents: dish.priceCents,
      }),
      `${dish.name} added`,
    );
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), ADDED_MS);
  }

  const veg = dish.tags.includes("vegan")
    ? "vegan"
    : dish.tags.includes("vegetarian")
      ? "veg"
      : null;

  const body = (
    <>
      <DishImage
        name={dish.name}
        imageUrl={dish.imageUrl}
        category={dish.categoryName}
        size="card"
      />
      <div style={{ padding: "var(--space-4)" }}>
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

        {(veg || dish.allergens.length > 0) && (
          <div
            style={{
              marginTop: "var(--space-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              flexWrap: "wrap",
            }}
          >
            {/* Dot AND word: a green dot alone is the classic colour-only status. */}
            {veg ? <VegMark kind={veg} /> : <span />}
            {dish.allergens.length > 0 && (
              <p className="eyebrow" style={{ textAlign: "right" }}>
                {dish.allergens.join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <li
      data-flash={flash || undefined}
      data-dish-card={dish.id}
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
      {out ? (
        <div>{body}</div>
      ) : (
        <Link
          href={`/menu/${dish.id}`}
          style={{ display: "block", color: "inherit", textDecoration: "none" }}
        >
          {body}
        </Link>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          padding: "0 var(--space-4) var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        {/* plenty renders nothing here — an unremarkable dish needs no badge. */}
        <RunwayMeter runway={dish.runway} />

        {out ? (
          <p className="eyebrow" style={{ marginLeft: "auto" }}>
            Sold out
          </p>
        ) : (
          <button
            type="button"
            onClick={add}
            aria-label={`Add ${dish.name} to your order`}
            style={{
              marginLeft: "auto",
              minHeight: "44px",
              padding: "0 var(--space-4)",
              borderRadius: "var(--radius-md)",
              border: "1px solid transparent",
              background: added ? "var(--color-ok)" : "var(--color-accent)",
              color: "var(--color-accent-fg)",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background var(--dur-fast) var(--ease-out-brigade)",
            }}
          >
            {/* Same verb both ways round: "Add" produces "Added". */}
            {added ? "Added" : "Add"}
          </button>
        )}
      </div>
    </li>
  );
}

function VegMark({ kind }: { kind: "veg" | "vegan" }) {
  return (
    <span
      className="eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        color: "var(--color-runway-plenty)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "2px",
          background: "currentColor",
        }}
      />
      {kind === "vegan" ? "vegan" : "vegetarian"}
    </span>
  );
}
