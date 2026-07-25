"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  NEXT_STATUS,
  STATION_LABEL,
  STATUS_ACTION,
  ageLevel,
  ticketAgeMinutes,
  type Docket as DocketData,
  type ItemStatus,
} from "@/lib/ops/tickets";

/*
 * One kitchen ticket.
 *
 * Built for the environment, not the screenshot: read at ~2 METRES, hot bright
 * kitchen, glare on a grease-filmed screen, hands busy, NO MOUSE. So —
 *   - no hover-only affordances; every action is visible at rest
 *   - one tap per action, targets sized for a cook who is not being careful
 *   - ticket age is the critical number and escalates in THREE ways at once:
 *     colour, a glyph, and a text label. A colourblind cook on a bad screen must
 *     still see that T11 has been waiting 23 minutes.
 *
 * Deliberately NOT styled as a thermal chit for the whole card. A paper-receipt
 * aesthetic is right for this component but sits one step from the generic
 * "broadsheet, hairline rules, zero radius" look, so the docket keeps a real
 * surface and the paper reference stays in the tear-edge and the monospace.
 */

const AGE_COLOR = {
  fresh: "var(--color-fg-muted)",
  watch: "var(--color-runway-low)",
  late: "var(--color-runway-critical)",
} as const;

const AGE_GLYPH = { fresh: "", watch: "▲", late: "▲▲" } as const;
const AGE_LABEL = { fresh: "", watch: "waiting", late: "late" } as const;

const STATUS_LABEL: Record<ItemStatus, string> = {
  placed: "on order",
  fired: "fired",
  cooking: "cooking",
  plated: "on the pass",
  served: "away",
  voided: "voided",
};

export function Docket({ docket, now }: { docket: DocketData; now: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const age = ticketAgeMinutes(docket.openedAt, new Date(now));
  const level = ageLevel(age);

  async function advance(itemId: string, to: ItemStatus) {
    setError(null);
    const res = await fetch(`/api/order-items/${itemId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: to }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "That didn't go through.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <article
      // Named so the narrow-viewport rule in globals.css can hold the ticket's type up
      // while the rest of the ops scale steps down. A cook reading the pass on their
      // phone is still reading a ticket under pressure.
      className="docket"
      style={{
        border: `2px solid ${level === "late" ? "var(--color-runway-critical)" : "var(--color-border-strong)"}`,
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg-raised)",
        display: "flex",
        flexDirection: "column",
        opacity: pending ? 0.7 : 1,
        transition: "opacity var(--dur-fast) linear",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "var(--text-step-2)",
            letterSpacing: "-0.02em",
          }}
        >
          {docket.tableLabel}
        </h3>
        <p
          className="mono"
          style={{
            color: AGE_COLOR[level],
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-2)",
            fontWeight: level === "fresh" ? 400 : 600,
          }}
        >
          {AGE_GLYPH[level] && <span aria-hidden="true">{AGE_GLYPH[level]}</span>}
          <span>{age}m</span>
          {AGE_LABEL[level] && (
            <span style={{ fontSize: "var(--text-step--1)" }}>{AGE_LABEL[level]}</span>
          )}
        </p>
      </header>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {docket.items.map((item) => {
          const next = NEXT_STATUS[item.status];
          const action = STATUS_ACTION[item.status];
          return (
            <li
              key={item.id}
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--space-3)",
                }}
              >
                <span
                  className="mono"
                  style={{ fontWeight: 600, fontSize: "var(--text-step-1)", flexShrink: 0 }}
                >
                  {item.qty}×
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "var(--text-step-0)",
                    lineHeight: 1.15,
                  }}
                >
                  {item.dishName}
                </span>
              </div>

              {item.notes && (
                <p
                  className="mono"
                  style={{
                    marginTop: "var(--space-1)",
                    color: "var(--color-runway-low)",
                    fontSize: "var(--text-step--1)",
                  }}
                >
                  ! {item.notes}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  marginTop: "var(--space-2)",
                }}
              >
                <span className="eyebrow">
                  {STATION_LABEL[item.station]} · {STATUS_LABEL[item.status]}
                </span>

                {next && action && (
                  <button
                    type="button"
                    onClick={() => void advance(item.id, next)}
                    disabled={pending}
                    style={{
                      minHeight: "48px",
                      minWidth: "112px",
                      padding: "0 var(--space-4)",
                      borderRadius: "var(--radius-md)",
                      border: "2px solid var(--color-accent)",
                      background: "var(--color-accent)",
                      color: "var(--color-accent-fg)",
                      font: "inherit",
                      fontWeight: 600,
                      fontSize: "var(--text-step-0)",
                      cursor: "pointer",
                    }}
                  >
                    {action}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p
          role="alert"
          style={{
            padding: "var(--space-3) var(--space-4)",
            color: "var(--color-runway-critical)",
            fontSize: "var(--text-step--1)",
          }}
        >
          {error}
        </p>
      )}
    </article>
  );
}
