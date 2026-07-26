"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/Busy";
import { RunwayMeter } from "@/components/runway/RunwayMeter";
import { STATION_LABEL, type RunwayRow } from "@/lib/ops/tickets";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

const RUNWAY_TABLES = ["ingredients"] as const;

/*
 * The runway board.
 *
 * Grouped by what a manager does about each group, not by band name:
 *   gone / going    → act now
 *   comfortable     → collapsed, because nothing is at stake
 *   no prediction   → stated honestly rather than guessed at
 *   no limit set    → a dish with no bill of materials is unconfigured, NOT scarce
 *
 * The last two groups exist because the alternative is worse than a gap: a
 * fabricated time, or a dish shown with an infinite runway as though that were a
 * measurement.
 */
export function RunwayBoard({
  restaurantId,
  rows,
  serviceOpen,
  daypart,
  canAdjustStock,
}: {
  restaurantId: string;
  rows: RunwayRow[];
  serviceOpen: boolean;
  daypart: string | null;
  canAdjustStock: boolean;
}) {
  const { live } = useRealtimeRefresh(`restaurant:${restaurantId}:runway`, RUNWAY_TABLES);

  /*
   * The top group means "will run out during service" — which is not the same as the
   * band, and grouping by band was wrong.
   *
   * Bands are thresholds on remaining minutes: critical under 45, low under 120, plenty
   * above. Service can be far longer than 120 minutes. Measured on real seeded data:
   * butter chicken at 6 portions selling 1.74/hr has 207 minutes left, so it is banded
   * `plenty` — and at 16:00 it runs out at 19:27, four hours before closing. Grouping by
   * band filed it under "Comfortable · enough for tonight", which is a plain false
   * statement about a dish the kitchen needed to prep more of.
   *
   * `lastsThroughService` is the field the engine computes for exactly this question, and
   * the board was ignoring it. Same mistake as the hardcoded label fixed earlier: deciding
   * a claim from the nearest available value rather than the one that means it.
   *
   * A band still decides how LOUD a row is — the card border and ordering — it just no
   * longer decides whether the row is a concern at all.
   */
  const willRunOut = (r: RunwayRow) =>
    r.runway.band === "out" ||
    (!r.runway.unlimited && !r.runway.insufficientHistory && !r.runway.lastsThroughService &&
      r.runway.predicted86At !== null) ||
    ["critical", "low"].includes(r.runway.band);

  const going = rows.filter(willRunOut);
  const noPrediction = rows.filter(
    (r) => !r.runway.unlimited && r.runway.insufficientHistory && !willRunOut(r),
  );
  const unlimited = rows.filter((r) => r.runway.unlimited);
  const comfortable = rows.filter(
    (r) => !r.runway.unlimited && !r.runway.insufficientHistory && !willRunOut(r),
  );

  return (
    <div>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: "var(--text-step-2)" }}>Runway</h1>
          <p className="eyebrow">
            {serviceOpen ? `${daypart} service · live` : "service closed"}
          </p>
          <p className="eyebrow" style={{ marginLeft: "auto" }}>
            {live ? "listening" : "reconnecting"}
          </p>
        </div>
        <p style={{ color: "var(--color-fg-muted)", marginTop: "var(--space-2)" }}>
          {serviceOpen
            ? "Time left at tonight’s actual sell rate. The named ingredient is what runs out first."
            : "Portions only — with no service running there’s no sell rate to predict from."}
        </p>
      </header>

      {going.length === 0 ? (
        <p
          style={{
            border: "1px dashed var(--color-border-strong)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-5)",
            color: "var(--color-fg-muted)",
          }}
        >
          {serviceOpen
            ? "Nothing is close. Every dish on the menu lasts the night."
            : "Nothing is counting down, because nothing is selling. These are portions on hand; the predictions come back when service opens."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-3)" }}>
          {going.map((row) => (
            <RunwayRowCard
              key={row.dishId}
              row={row}
              canAdjustStock={canAdjustStock}
            />
          ))}
        </ul>
      )}

      {/*
       * The label has to depend on whether service is running, and it did not.
       * "enough for tonight" was hardcoded, so at 03:30 — kitchen shut, no sell rate to
       * predict from — the board declared all 28 dishes good for the night, four portions
       * of prawns included. Two lines above, its own header correctly read "service
       * closed · portions only". A screen that contradicts itself in one viewport is
       * worse than one that says nothing, and the engine was never the problem: it
       * returns no prediction when closed, and this component overrode that with a
       * cheerful string.
       */}
      <Group
        title={serviceOpen ? "Comfortable" : "Portions on hand"}
        count={comfortable.length}
      >
        {comfortable.map((r) => (
          <QuietRow
            key={r.dishId}
            row={r}
            detail={serviceOpen ? "enough for tonight" : "no sell rate while closed"}
          />
        ))}
      </Group>

      <Group title="Not enough history to predict" count={noPrediction.length}>
        {noPrediction.map((r) => (
          <QuietRow
            key={r.dishId}
            row={r}
            detail={`${r.sampleCount} of 3 samples needed`}
          />
        ))}
      </Group>

      <Group title="No limit set" count={unlimited.length}>
        {unlimited.map((r) => (
          <QuietRow key={r.dishId} row={r} detail="no recipe entered — not tracked" />
        ))}
      </Group>
    </div>
  );
}

function RunwayRowCard({
  row,
  canAdjustStock,
}: {
  row: RunwayRow;
  canAdjustStock: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Stock adjustment lives HERE rather than on the inventory list: you top up at
   * the moment you notice the shortage, which is the moment this row told you. It
   * also keeps a write path on a never-cut screen.
   */
  async function topUp(portions: number) {
    if (!row.bindingIngredientId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inventory/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: row.bindingIngredientId,
        // Enough of the binding ingredient for `portions` more of this dish.
        delta: portions * portionCost(row),
        reason: "purchase",
        note: `top-up from the runway board for ${row.name}`,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "That didn't go through.");
      return;
    }
    router.refresh();
  }

  return (
    <li
      style={{
        border: `2px solid ${
          row.runway.band === "out" || row.runway.band === "critical"
            ? "var(--color-runway-critical)"
            : "var(--color-border-strong)"
        }`,
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg-raised)",
        padding: "var(--space-4)",
        display: "flex",
        gap: "var(--space-5)",
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 14rem", minWidth: 0 }}>
        <h2
          style={{
            fontSize: "var(--text-step-1)",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
          }}
        >
          {row.name}
        </h2>
        <p className="eyebrow" style={{ marginTop: "var(--space-1)" }}>
          {STATION_LABEL[row.station]}
          {row.unitsPerHour > 0 && ` · selling ${row.unitsPerHour.toFixed(1)}/hr`}
        </p>
        {row.bindingIngredientName && (
          <p style={{ marginTop: "var(--space-2)", fontSize: "var(--text-step--1)" }}>
            Runs out of{" "}
            <strong style={{ color: "var(--color-runway-low)" }}>
              {row.bindingIngredientName}
            </strong>
            {row.bindingStockQty !== null && (
              <span className="mono" style={{ color: "var(--color-fg-muted)" }}>
                {" "}
                — {row.bindingStockQty} left
              </span>
            )}
          </p>
        )}
      </div>

      <div style={{ flex: "0 0 auto" }}>
        <RunwayMeter
          runway={row.runway}
          bindingIngredientName={null}
          unitsPerHour={row.unitsPerHour}
          detail
        />
      </div>

      {canAdjustStock && row.bindingIngredientId && (
        <div style={{ flex: "0 0 auto", display: "grid", gap: "var(--space-2)" }}>
          {/* Was `busy ? "…" : "+10 portions"`. A single ellipsis on a wall screen at two
              metres is indistinguishable from nothing happening, and the whole round trip
              — adjust_stock, then a server re-render of the board — is a second or two. */}
          <ActionButton busy={busy} busyLabel="Adding…" onClick={() => void topUp(10)}>
            +10 portions
          </ActionButton>
          {error && (
            <p
              role="alert"
              style={{ color: "var(--color-runway-critical)", fontSize: "var(--text-step--1)" }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * How much of the binding ingredient one portion needs.
 *
 * Derived from what the board already knows — stock ÷ portions — rather than
 * fetching the recipe row, since the board never needs the full bill of materials.
 * Falls back to 1 when portions is 0, so a top-up on an already-86'd dish still
 * adds a sensible amount rather than dividing by zero.
 */
function portionCost(row: RunwayRow): number {
  if (row.bindingStockQty === null) return 1;
  if (row.runway.portions <= 0) return Math.max(row.bindingStockQty, 1);
  return row.bindingStockQty / row.runway.portions;
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details style={{ marginTop: "var(--space-5)" }}>
      <summary
        style={{
          cursor: "pointer",
          padding: "var(--space-3) 0",
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-fg-muted)",
        }}
      >
        {title} <span className="mono">({count})</span>
      </summary>
      <ul
        style={{
          listStyle: "none",
          margin: "var(--space-2) 0 0",
          padding: 0,
          display: "grid",
          gap: "var(--space-1)",
        }}
      >
        {children}
      </ul>
    </details>
  );
}

function QuietRow({ row, detail }: { row: RunwayRow; detail: string }) {
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        padding: "var(--space-2) 0",
        borderBottom: "1px solid var(--color-border)",
        fontSize: "var(--text-step--1)",
      }}
    >
      <span>{row.name}</span>
      <span className="mono" style={{ color: "var(--color-fg-subtle)" }}>
        {row.runway.unlimited ? "—" : `${row.runway.portions} left`} · {detail}
      </span>
    </li>
  );
}
