import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToOrder } from "@/components/guest/AddToOrder";
import { RunwayMeter } from "@/components/runway/RunwayMeter";
import { getDishDetail } from "@/lib/data/menu";
import { formatCents } from "@/lib/money";

/*
 * Dish detail.
 *
 * Shows ingredient NAMES as transparency without exposing recipe quantities — the
 * quantities are the recipe, and the recipe is the restaurant's. Never any cost.
 */

export const dynamic = "force-dynamic";

export default async function DishPage({ params }: { params: Promise<{ dishId: string }> }) {
  const { dishId } = await params;
  const detail = await getDishDetail(dishId);

  if (!detail) notFound();

  const { dish, ingredientNames } = detail;
  const out = dish.runway.band === "out";

  return (
    <article style={{ padding: "var(--space-5) var(--space-4) var(--space-8)" }}>
      <p style={{ marginBottom: "var(--space-4)" }}>
        <Link href="/menu" style={{ color: "var(--color-fg-muted)" }}>
          ← Menu
        </Link>
      </p>

      <h1 style={{ fontSize: "var(--text-step-3)" }}>{dish.name}</h1>

      <p
        className="mono"
        style={{ fontSize: "var(--text-step-1)", margin: "var(--space-3) 0" }}
      >
        {formatCents(dish.priceCents)}
      </p>

      {dish.description && (
        <p style={{ color: "var(--color-fg-muted)", marginBottom: "var(--space-5)" }}>
          {dish.description}
        </p>
      )}

      {/* The runway, in full: this is the one screen with room to explain it. */}
      <section
        style={{
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-bg-raised)",
          padding: "var(--space-4)",
          marginBottom: "var(--space-5)",
        }}
      >
        {out ? (
          <>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>
              Finished for tonight.
            </p>
            <p style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-step--1)" }}>
              The kitchen has run out of this one. Everything still on the menu is genuinely
              available.
            </p>
          </>
        ) : (
          <>
            <RunwayMeter runway={dish.runway} />
            <p
              style={{
                marginTop: "var(--space-3)",
                color: "var(--color-fg-muted)",
                fontSize: "var(--text-step--1)",
              }}
            >
              {dish.runway.predicted86At
                ? "Counted from the kitchen's stock and how fast this is selling tonight."
                : "Counted from the kitchen's stock."}
            </p>
          </>
        )}
      </section>

      <div style={{ marginBottom: "var(--space-6)" }}>
        <AddToOrder
          dishId={dish.id}
          name={dish.name}
          unitPriceCents={dish.priceCents}
          portions={dish.runway.portions}
          unlimited={dish.runway.unlimited}
          disabled={out}
          disabledReason="Finished for tonight — nothing to add."
        />
      </div>

      {dish.allergens.length > 0 && (
        <section style={{ marginBottom: "var(--space-5)" }}>
          <h2 className="eyebrow">Allergens</h2>
          <p style={{ marginTop: "var(--space-2)" }}>{dish.allergens.join(" · ")}</p>
        </section>
      )}

      {ingredientNames.length > 0 && (
        <section>
          <h2 className="eyebrow">What&rsquo;s in it</h2>
          <p style={{ marginTop: "var(--space-2)", color: "var(--color-fg-muted)" }}>
            {ingredientNames.join(", ")}
          </p>
        </section>
      )}
    </article>
  );
}
