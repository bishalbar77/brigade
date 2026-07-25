"use client";

import Link from "next/link";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { STATUS_LABEL, type ItemStatus } from "@/lib/ops/tickets";
import { formatCents } from "@/lib/money";

/*
 * Live order tracking.
 *
 * Per ITEM, not per order. An order-level status cannot express "starter away, main
 * still on the grill" — which is the entire job of the pass, and the thing a guest
 * actually wants to know.
 *
 * Guest-facing language throughout: a diner doesn't know what "on the pass" means,
 * so the kitchen's vocabulary is translated here even though the same statuses are
 * shown in kitchen terms on the KDS.
 */

const GUEST_STAGES: { status: ItemStatus; label: string }[] = [
  { status: "placed", label: "Ordered" },
  { status: "fired", label: "Started" },
  { status: "cooking", label: "Cooking" },
  { status: "plated", label: "Ready" },
  { status: "served", label: "Served" },
];

const STAGE_INDEX: Record<ItemStatus, number> = {
  placed: 0,
  fired: 1,
  cooking: 2,
  plated: 3,
  served: 4,
  voided: -1,
};

export interface TrackedItem {
  id: string;
  dishName: string;
  qty: number;
  unitPriceCents: number;
  status: ItemStatus;
  prepMinutes: number;
}

export function TrackingRail({
  orderId,
  tableLabel,
  items,
  allServed,
  totalCents,
}: {
  orderId: string;
  tableLabel: string | null;
  items: TrackedItem[];
  allServed: boolean;
  totalCents: number;
}) {
  const { live } = useRealtimeRefresh(`order:${orderId}`, ["order_items"]);

  return (
    <section style={{ padding: "var(--space-5) var(--space-4) var(--space-8)" }}>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
          <h1 style={{ fontSize: "var(--text-step-2)" }}>
            {allServed ? "Enjoy" : "In the kitchen"}
          </h1>
          <p className="eyebrow" style={{ marginLeft: "auto" }}>
            {live ? "live" : "reconnecting"}
          </p>
        </div>
        <p className="eyebrow" style={{ marginTop: "var(--space-1)" }}>
          {tableLabel ? `Table ${tableLabel}` : "Your order"}
        </p>
      </header>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-4)" }}>
        {items.map((item) => {
          const voided = item.status === "voided";
          const reached = STAGE_INDEX[item.status];
          return (
            <li
              key={item.id}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                background: "var(--color-bg-raised)",
                padding: "var(--space-4)",
                opacity: voided ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  marginBottom: "var(--space-3)",
                }}
              >
                <p style={{ fontWeight: 600 }}>
                  {item.qty > 1 && <span className="mono">{item.qty}× </span>}
                  {item.dishName}
                </p>
                <p className="mono" style={{ color: "var(--color-fg-muted)" }}>
                  {formatCents(item.unitPriceCents * item.qty)}
                </p>
              </div>

              {voided ? (
                /* Shown with a reason, never silently removed. Something vanishing
                   without explanation is worse than bad news. */
                <p style={{ color: "var(--color-runway-low)", fontSize: "var(--text-step--1)" }}>
                  The kitchen had to cancel this one. You haven&rsquo;t been charged for it.
                </p>
              ) : (
                <>
                  <ol
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 1fr)",
                      gap: "var(--space-1)",
                    }}
                  >
                    {GUEST_STAGES.map((stage, i) => {
                      const done = i <= reached;
                      return (
                        <li key={stage.status}>
                          <div
                            aria-hidden="true"
                            style={{
                              height: "5px",
                              borderRadius: "999px",
                              background: done
                                ? "var(--color-accent)"
                                : "var(--color-bg-sunken)",
                            }}
                          />
                          <span
                            style={{
                              display: "block",
                              marginTop: "var(--space-1)",
                              fontSize: "0.68rem",
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              color: done ? "var(--color-fg)" : "var(--color-fg-subtle)",
                            }}
                          >
                            {stage.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  {/* A RANGE, never a countdown. A precise number that turns out
                      wrong costs more trust than an honest range. */}
                  {item.status !== "served" && (
                    <p
                      style={{
                        marginTop: "var(--space-3)",
                        color: "var(--color-fg-muted)",
                        fontSize: "var(--text-step--1)",
                      }}
                    >
                      {item.status === "plated"
                        ? "Ready — on its way over."
                        : `About ${item.prepMinutes}–${item.prepMinutes + 6} minutes`}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {allServed && (
        <div style={{ marginTop: "var(--space-6)" }}>
          <p style={{ marginBottom: "var(--space-3)", color: "var(--color-fg-muted)" }}>
            Everything&rsquo;s been served. Your bill comes to {formatCents(totalCents)}.
          </p>
          <Link
            href={`/bill/${orderId}` as never}
            role="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0 var(--space-5)",
              minHeight: "48px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent)",
              color: "var(--color-accent-fg)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            View bill
          </Link>
        </div>
      )}
    </section>
  );
}
