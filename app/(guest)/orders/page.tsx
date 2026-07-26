import Link from "next/link";
import { getOrderHistory } from "@/lib/data/orders";
import { formatCents } from "@/lib/money";
import { zonedParts } from "@/lib/runway/clock";

/*
 * A diner's own orders.
 *
 * This page exists because `/order/[id]` had no way in. It was reached once, by the
 * redirect that fires the moment an order is placed, and the id lived nowhere but the
 * address bar — so closing the tab put a diner's own order and bill permanently out of
 * reach while the kitchen kept both on screen.
 *
 * Every row is a link, and WHERE it goes depends on what the diner would want next:
 *   still cooking  → /order/[id], the live rail
 *   ready to pay   → /bill/[orderId], because that is the next thing they must do
 *   paid           → /bill/[orderId], which renders as a receipt once settled
 * One destination per state, chosen for them. A row with two buttons on it makes the
 * reader do work the screen already had enough information to do.
 */

export const dynamic = "force-dynamic";

/** "Sat 26 Jul, 21:14" in the restaurant's zone. */
function whenLabel(iso: string, timeZone: string): string {
  const at = new Date(iso);
  const date = at.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });
  return `${date}, ${zonedParts(at, timeZone).hhmm}`;
}

/** The one thing this order is waiting on, in a diner's words. */
function stateOf(order: { paid: boolean; allServed: boolean; itemCount: number }): {
  label: string;
  tone: "paid" | "action" | "cooking";
  href: (id: string) => string;
  cta: string;
} {
  if (order.paid) {
    return { label: "Paid", tone: "paid", href: (id) => `/bill/${id}`, cta: "View receipt" };
  }
  if (order.allServed) {
    return { label: "Ready to pay", tone: "action", href: (id) => `/bill/${id}`, cta: "Settle up" };
  }
  return { label: "In the kitchen", tone: "cooking", href: (id) => `/order/${id}`, cta: "Track it" };
}

const TONE = {
  paid: "var(--color-fg-subtle)",
  action: "var(--color-accent)",
  cooking: "var(--color-runway-low)",
} as const;

export default async function OrdersPage() {
  const { orders, timeZone, signedIn } = await getOrderHistory();

  if (!signedIn) {
    return (
      <section style={{ padding: "var(--space-6) var(--space-4)", maxWidth: "34rem" }}>
        <h1 style={{ fontSize: "var(--text-step-2)" }}>Your orders</h1>
        <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
          Sign in and everything you order here stays on this page — what the kitchen is
          cooking, and every bill you have settled.
        </p>
        <Link
          href={"/auth/sign-in?returnTo=/orders" as never}
          role="button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: "48px",
            padding: "0 var(--space-5)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent)",
            color: "var(--color-accent-fg)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section style={{ padding: "var(--space-5) var(--space-4)" }}>
      <h1 style={{ fontSize: "var(--text-step-2)" }}>Your orders</h1>

      {orders.length === 0 ? (
        /* An empty screen is an invitation, not a statement. The one thing to do from
           here is order something, so that is the button. */
        <div style={{ marginTop: "var(--space-5)" }}>
          <p style={{ color: "var(--color-fg-muted)", marginBottom: "var(--space-4)" }}>
            Nothing yet. Once you order, this is where you can follow it and find the bill
            again afterwards.
          </p>
          <Link
            href="/menu"
            role="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "48px",
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
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: "var(--space-5) 0 0",
            padding: 0,
            display: "grid",
            gap: "var(--space-3)",
          }}
        >
          {orders.map((order) => {
            const state = stateOf(order);
            // Two dishes named, then a count. A full list per row turns a scannable
            // history into a wall of text; the detail is one tap away by design.
            const named = order.lines
              .filter((l) => l.status !== "voided")
              .slice(0, 2)
              .map((l) => (l.qty > 1 ? `${l.qty}× ${l.dishName}` : l.dishName));
            const moreCount = order.lines.filter((l) => l.status !== "voided").length - named.length;

            return (
              <li key={order.id}>
                <Link
                  href={state.href(order.id) as never}
                  style={{
                    display: "block",
                    padding: "var(--space-4)",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${
                      state.tone === "action" ? "var(--color-accent)" : "var(--color-border)"
                    }`,
                    background: "var(--color-bg-raised)",
                    color: "var(--color-fg)",
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "var(--space-3)",
                    }}
                  >
                    <span className="eyebrow">{whenLabel(order.openedAt, timeZone)}</span>
                    {/* State carries colour AND words — never colour alone. */}
                    <span
                      className="eyebrow"
                      style={{ color: TONE[state.tone], fontWeight: 600 }}
                    >
                      {state.label}
                    </span>
                  </div>

                  <p
                    style={{
                      marginTop: "var(--space-2)",
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: "var(--text-step-0)",
                      lineHeight: 1.25,
                    }}
                  >
                    {named.join(", ")}
                    {moreCount > 0 && (
                      <span style={{ color: "var(--color-fg-muted)", fontWeight: 400 }}>
                        {" "}
                        and {moreCount} more
                      </span>
                    )}
                  </p>

                  <div
                    style={{
                      marginTop: "var(--space-3)",
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "var(--space-3)",
                    }}
                  >
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {formatCents(order.totalCents)}
                      {order.tipCents > 0 && (
                        <span
                          style={{
                            color: "var(--color-fg-subtle)",
                            fontWeight: 400,
                            fontSize: "var(--text-step--1)",
                          }}
                        >
                          {" "}
                          incl. {formatCents(order.tipCents)} tip
                        </span>
                      )}
                    </span>
                    <span style={{ color: TONE[state.tone], fontWeight: 600 }}>
                      {state.cta} &rarr;
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
