import { RunwayMeter } from "@/components/runway/RunwayMeter";
import type { RunwayRow } from "@/lib/ops/tickets";

/*
 * The runway rail: what's about to 86, alongside the dockets.
 *
 * This is why the KDS and the runway data live on ONE screen. A cook needs to know
 * what's cooking and what's about to run out in the same glance — if learning that
 * the scallops are nearly gone requires leaving the ticket wall, they won't, and
 * they'll find out when a docket arrives for a dish they can't make.
 *
 * Condensed on purpose. The manager's board at /ops/runway carries the sell rate
 * and the stock actions; here a cook needs the dish, the count and the time.
 */
export function RunwayRail({ rows }: { rows: RunwayRow[] }) {
  // Only what's actually at risk. A rail listing all 20 dishes is wallpaper — it
  // would be scanned once on the first day and never again.
  const atRisk = rows.filter(
    (r) => r.runway.band === "out" || r.runway.band === "critical" || r.runway.band === "low",
  );

  return (
    <aside
      aria-label="What's about to run out"
      className="kds-rail"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--color-bg-sunken)",
      }}
    >
      <h2
        style={{
          fontSize: "var(--text-step-0)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Runway
      </h2>

      {atRisk.length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-step--1)" }}>
          Nothing close. Everything on the menu lasts the night.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-4)" }}>
          {atRisk.map((row) => (
            <li key={row.dishId}>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "var(--text-step--1)",
                  lineHeight: 1.2,
                  marginBottom: "var(--space-1)",
                }}
              >
                {row.name}
              </p>
              <RunwayMeter
                runway={row.runway}
                bindingIngredientName={row.bindingIngredientName}
                detail
              />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
