import Link from "next/link";
import { RunwayMeter } from "@/components/runway/RunwayMeter";
import { getMenuWithRunway } from "@/lib/data/menu";

/*
 * Landing. The hero PROVES the product rather than describing it: a real dish
 * with its real remaining portions and its real predicted 86 time, read from the
 * live database at request time. A headline claiming "live inventory" is a
 * claim; a number that came from the pantry is evidence.
 *
 * Deliberately not the template answer (big stat + supporting stats + gradient).
 * The hero IS the mechanism, running.
 */

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const { dishes, serviceOpen } = await getMenuWithRunway();

  // Lead with the dish closest to running out — the sharpest evidence available.
  // byUrgency already ordered them, so the scarce ones are first.
  const scarce = dishes.filter((d) => !d.runway.unlimited && d.runway.portions > 0).slice(0, 3);
  const lead = scarce[0];

  return (
    <div style={{ padding: "var(--space-6) var(--space-4) var(--space-8)" }}>
      <section>
        <p className="eyebrow">Brigade · restaurant operations</p>

        <h1
          style={{
            fontSize: "var(--text-step-4)",
            margin: "var(--space-4) 0 var(--space-5)",
            maxWidth: "22ch",
          }}
        >
          A printed menu is a promise the kitchen may not keep.
        </h1>

        <p
          style={{
            fontSize: "var(--text-step-1)",
            color: "var(--color-fg-muted)",
            maxWidth: "46ch",
            marginBottom: "var(--space-6)",
          }}
        >
          Brigade makes the menu a live function of the pantry — and works out how long
          each dish has left at tonight&rsquo;s actual sell rate.
        </p>

        {/* The proof. Not an illustration — this is the live database. */}
        {lead ? (
          <div
            style={{
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-bg-raised)",
              padding: "var(--space-5)",
            }}
          >
            <p className="eyebrow">Right now, in the kitchen</p>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "var(--text-step-2)",
                margin: "var(--space-2) 0 var(--space-4)",
              }}
            >
              {lead.name}
            </p>

            <RunwayMeter runway={lead.runway} />

            <p
              style={{
                marginTop: "var(--space-4)",
                paddingTop: "var(--space-4)",
                borderTop: "1px solid var(--color-border)",
                color: "var(--color-fg-muted)",
                fontSize: "var(--text-step--1)",
              }}
            >
              {/* The explanation must match what the gauge actually shows. Claiming
                  a rate-based prediction while the gauge says "not enough history"
                  would be the page contradicting itself. */}
              {lead.runway.predicted86At
                ? "Counted from the recipe against live stock, then divided by how fast it’s actually selling tonight. Nobody typed it in."
                : serviceOpen
                  ? "Counted from the recipe against live stock. There isn’t enough sales history for this dish yet to predict when it runs out, so we don’t guess."
                  : "Counted from the recipe against live stock. The kitchen is closed, so there’s no sell rate to predict from — portions only."}
            </p>
          </div>
        ) : (
          <div
            style={{
              border: "1px dashed var(--color-border-strong)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-5)",
              color: "var(--color-fg-muted)",
            }}
          >
            <p>The kitchen is fully stocked — nothing is close to running out.</p>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            marginTop: "var(--space-5)",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/menu"
            role="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0 var(--space-5)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent)",
              color: "var(--color-accent-fg)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            See what&rsquo;s on
          </Link>
          <Link
            href="/reserve"
            role="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0 var(--space-5)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-fg)",
              textDecoration: "none",
            }}
          >
            Book a table
          </Link>
        </div>
      </section>

      {/* Runner-up evidence. Three is enough; a grid of twelve is a menu, not a hero. */}
      {scarce.length > 1 && (
        <section style={{ marginTop: "var(--space-8)" }}>
          <h2
            style={{
              fontSize: "var(--text-step-1)",
              marginBottom: "var(--space-4)",
            }}
          >
            Also going tonight
          </h2>
          <ul style={{ listStyle: "none", display: "grid", gap: "var(--space-3)" }}>
            {scarce.slice(1).map((dish) => (
              <li
                key={dish.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  padding: "var(--space-4)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <span style={{ fontWeight: 600 }}>{dish.name}</span>
                <RunwayMeter runway={dish.runway} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        style={{
          marginTop: "var(--space-8)",
          paddingTop: "var(--space-6)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <p style={{ color: "var(--color-fg-muted)", maxWidth: "50ch" }}>
          Existing tills already stop selling a dish once its stock hits zero. Brigade
          works out <em>when</em> that will happen, tells the kitchen while there is still
          time to act, and shows you before you order.
        </p>
        <p style={{ marginTop: "var(--space-4)" }}>
          <Link href="/ops/kds" className="eyebrow" style={{ color: "var(--color-accent)" }}>
            Staff → the pass
          </Link>
        </p>
      </section>
    </div>
  );
}
