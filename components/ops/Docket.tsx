"use client";

import { useEffect, useState, useTransition } from "react";
import { Spinner } from "@/components/Busy";
import { useRouter } from "next/navigation";
import {
  NEXT_STATUS,
  STATION_LABEL,
  STATUS_ACTION,
  ageLevel,
  canAdvance,
  ticketAgeMinutes,
  type Docket as DocketData,
  type ItemStatus,
  type Viewer,
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

export function Docket({
  docket,
  now,
  viewer,
}: {
  docket: DocketData;
  now: number;
  /** Whose screen this is. Decides which actions are offered at all. */
  viewer: Viewer;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  /*
   * Errors are per ITEM, keyed by id.
   *
   * One `error` string for the whole docket put the message wherever the docket ended,
   * under whichever item happened to be last. Reported from the deployed build: a
   * ticket showed "Sending a plate away is expo's call." underneath a Paneer butter
   * masala whose only action was "Cooking" — a sentence about plates, under an item it
   * had nothing to do with, on a docket where nothing could be sent away. Even with the
   * right wording, a docket-level error is a message without an address.
   */
  const [errors, setErrors] = useState<Record<string, string>>({});
  /*
   * Busy is per ITEM, and it covers the FETCH.
   *
   * Two bugs in one line before this. `pending` came from useTransition, but the
   * `await fetch` ran BEFORE startTransition — so for the entire 2-3 second round trip
   * the button was enabled and showed nothing, which is exactly the double-tap hazard
   * the comment below says it prevents. And it was per-docket, so firing one item
   * disabled every other item on the same ticket.
   */
  const [sending, setSending] = useState<string | null>(null);

  const age = ticketAgeMinutes(docket.openedAt, new Date(now));
  const level = ageLevel(age);

  // A refresh brought new data, so whatever went wrong last time is no longer on screen.
  // The error used to clear only on the next attempt and otherwise sat there for good.
  const itemStates = docket.items.map((i) => `${i.id}:${i.status}`).join("|");
  useEffect(() => {
    setErrors({});
  }, [itemStates]);

  async function advance(itemId: string, to: ItemStatus) {
    setErrors((e) => { const { [itemId]: _gone, ...rest } = e; return rest; });
    setSending(itemId);
    try {
      const res = await fetch(`/api/order-items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setErrors((e) => ({ ...e, [itemId]: body.message ?? "That didn't go through." }));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      // A dropped connection mid-service must not leave the button spinning forever.
      setErrors((e) => ({ ...e, [itemId]: "No connection to the kitchen. Try again." }));
    } finally {
      setSending(null);
    }
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
        opacity: refreshing ? 0.7 : 1,
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
          const verdict = canAdvance(viewer, item);
          const busy = sending === item.id;
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

                {next && action && verdict.allowed && (
                  /*
                   * The whole card used to drop to opacity 0.7 and that was the only sign
                   * anything had happened — at two metres, through glare, on a screen with
                   * grease on it, that is no sign at all. A cook who is not sure the tap
                   * landed taps again, and the second tap is an ILLEGAL_TRANSITION at best
                   * and the next status at worst.
                   *
                   * minWidth is kept from the original so the button does not resize when
                   * the label changes: a target that moves under a thumb mid-press is how
                   * the wrong ticket gets fired.
                   */
                  <button
                    type="button"
                    onClick={() => void advance(item.id, next)}
                    disabled={busy}
                    aria-busy={busy}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "var(--space-2)",
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
                      cursor: busy ? "progress" : "pointer",
                    }}
                  >
                    {busy ? (
                      <>
                        <Spinner label={`${action}, sending`} />
                        <span>Sending…</span>
                      </>
                    ) : (
                      action
                    )}
                  </button>
                )}

                {/*
                  Not your call — so say whose, rather than offer a button that fails.
                  This is the fix for the stuck pass: a chef's ticket at `plated` showed
                  an "Away" button, and `advance_item_status` refuses `served` for a chef
                  every single time. The ticket could not move and nothing said why.
                  Authorization still lives in the database; this only stops the UI
                  proposing something it knows will be refused.
                */}
                {next && !verdict.allowed && verdict.who && (
                  <p
                    className="eyebrow"
                    style={{
                      textAlign: "right",
                      color: "var(--color-fg-subtle)",
                      maxWidth: "12rem",
                    }}
                  >
                    {verdict.who}
                  </p>
                )}
              </div>

              {/* Under the item it concerns, not at the foot of the ticket. */}
              {errors[item.id] && (
                <p
                  role="alert"
                  style={{
                    marginTop: "var(--space-2)",
                    color: "var(--color-runway-critical)",
                    fontSize: "var(--text-step--1)",
                  }}
                >
                  {errors[item.id]}
                </p>
              )}
            </li>
          );
        })}
      </ul>

    </article>
  );
}
