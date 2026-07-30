"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/Busy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EMPTY_CART,
  clearCart,
  overAvailability,
  readCart,
  removeDish,
  setDishQty,
  setNotes,
  setQty,
  subtotalCents,
  writeCart,
  type Cart,
  type CartLine,
} from "@/lib/cart";
import { formatCents, formatRate, taxCents } from "@/lib/money";

/*
 * The cart, and the moment the concurrency work becomes visible.
 *
 * Two different failures, handled differently on purpose:
 *
 *  - PRE-SUBMIT: the cart has been sitting while other tables ordered, so a line now
 *    exceeds availability. Caught here with a warning and one-tap fixes, because a
 *    warning you can act on beats a rejection you can't.
 *
 *  - THE RACE: two guests both saw "1 left" and both tapped. Nothing client-side can
 *    prevent that; only the row locks inside place_order() can settle it. The loser
 *    gets a 409 naming the dish and the real remaining count, and — critically —
 *    NOTHING was charged and NO partial order exists, because the whole transaction
 *    rolled back. Saying so explicitly matters: silence there reads as "did it work?"
 */

interface ShortfallError {
  code: string;
  dish?: string;
  available?: number;
  message: string;
}

export function CartView({
  restaurantId,
  tableId,
  tableLabel,
  portionsByDish,
  taxRate,
  signedIn,
}: {
  restaurantId: string;
  tableId: string | null;
  tableLabel: string | null;
  portionsByDish: Record<string, number>;
  /** The restaurant's real rate. Never a literal here — see the note in MenuPayload. */
  taxRate: number;
  signedIn: boolean;
}) {
  const router = useRouter();

  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ShortfallError | null>(null);

  // localStorage is only readable after mount, so the first paint is deliberately
  // empty rather than guessing and flickering.
  useEffect(() => {
    setCart(readCart());
    setHydrated(true);
    const sync = () => setCart(readCart());
    window.addEventListener("brigade:cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("brigade:cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const problems = useMemo(() => overAvailability(cart, portionsByDish), [cart, portionsByDish]);
  const subtotal = subtotalCents(cart);
  const tax = taxCents(subtotal, taxRate);

  function update(next: Cart, announce?: string) {
    setCart(next);
    writeCart(next, announce);
  }

  async function placeOrder() {
    setBusy(true);
    setFailure(null);

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        tableId,
        items: cart.lines.map((l) => ({ dishId: l.dishId, qty: l.qty, notes: l.notes })),
        // Double-tapping must not create two orders. The server returns the
        // existing order for a repeated key rather than inserting again.
        // Notes are part of the key: now that they exist, the same dishes at the same
        // quantities with a DIFFERENT instruction is a different order, and returning
        // the previous one would send the old note to the kitchen.
        idempotencyKey: `${restaurantId}:${JSON.stringify(
          cart.lines.map((l) => [l.dishId, l.qty, l.notes ?? ""]),
        )}`,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as ShortfallError & { orderId?: string };

    if (res.ok && body.orderId) {
      clearCart();
      router.replace(`/order/${body.orderId}` as never);
      return;
    }

    setBusy(false);
    setFailure(body.message ? body : { code: "ERROR", message: "That didn't go through." });
    // Availability moved, so refresh the server-rendered counts.
    router.refresh();
  }

  if (!hydrated) {
    return <p style={{ padding: "var(--space-6) var(--space-4)" }}>…</p>;
  }

  if (cart.lines.length === 0) {
    return (
      <section style={{ padding: "var(--space-6) var(--space-4)" }}>
        <h1 style={{ fontSize: "var(--text-step-2)" }}>Your order</h1>
        {/* An empty screen is an invitation to act, not a dead end. */}
        <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
          Nothing here yet.
        </p>
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
      </section>
    );
  }

  return (
    <section style={{ padding: "var(--space-5) var(--space-4) var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-step-2)", marginBottom: "var(--space-2)" }}>Your order</h1>
      <p className="eyebrow" style={{ marginBottom: "var(--space-5)" }}>
        {tableLabel ? `Table ${tableLabel}` : "No table set"}
      </p>

      {/* The race, lost. Named dish, real count, and an explicit statement that
          nothing was charged — that last part is what stops the guest wondering. */}
      {failure?.code === "INSUFFICIENT_STOCK" && (
        <div
          role="alert"
          style={{
            border: "2px solid var(--color-runway-critical)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
          }}
        >
          <p style={{ fontWeight: 600, fontSize: "var(--text-step-1)" }}>{failure.message}</p>
          <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-2) 0 var(--space-4)" }}>
            Someone at another table ordered it a moment ago. Nothing was charged and your
            order wasn&rsquo;t placed.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {failure.dish && (failure.available ?? 0) > 0 && (
              <Fix
                onClick={() => {
                  const line = cart.lines.find((l) => l.name === failure.dish);
                  // By dish, not by line: the server named a DISH that is short, and
                  // the guest may have split it across two lines.
                  if (line) update(setDishQty(cart, line.dishId, failure.available!));
                  setFailure(null);
                }}
              >
                Reduce to {failure.available}
              </Fix>
            )}
            {failure.dish && (
              <Fix
                onClick={() => {
                  const line = cart.lines.find((l) => l.name === failure.dish);
                  if (line) update(removeDish(cart, line.dishId));
                  setFailure(null);
                }}
              >
                Remove it and order the rest
              </Fix>
            )}
            <Fix onClick={() => router.push("/menu")}>See what&rsquo;s left</Fix>
          </div>
        </div>
      )}

      {failure && failure.code !== "INSUFFICIENT_STOCK" && (
        <div
          role="alert"
          style={{
            borderLeft: "3px solid var(--color-runway-critical)",
            padding: "var(--space-3)",
            marginBottom: "var(--space-5)",
            background: "var(--color-bg-sunken)",
          }}
        >
          <p>{failure.message}</p>
          {failure.code === "NOT_AUTHENTICATED" && (
            <p style={{ marginTop: "var(--space-2)" }}>
              <Link
                href={"/auth/sign-in?returnTo=/cart" as never}
                style={{ color: "var(--color-accent)" }}
              >
                Sign in →
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Caught BEFORE submitting: the cart sat while other tables ordered. */}
      {problems.length > 0 && (
        <div
          style={{
            border: "1px solid var(--color-runway-low)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>
            Some of this has moved
          </p>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
            {problems.map(({ dishId, name, ordered, available }) => (
              <li key={dishId}>
                <p style={{ fontSize: "var(--text-step--1)" }}>
                  {available === 0
                    ? `${name} has finished.`
                    : `Only ${available} ${name} left — you have ${ordered}.`}
                </p>
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                  {available > 0 && (
                    <Fix onClick={() => update(setDishQty(cart, dishId, available))}>
                      Reduce to {available}
                    </Fix>
                  )}
                  <Fix onClick={() => update(removeDish(cart, dishId))}>Remove</Fix>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-3)" }}>
        {cart.lines.map((line) => (
          <li
            key={line.id}
            style={{
              padding: "var(--space-3) 0",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-4)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600 }}>{line.name}</p>
                <p className="eyebrow">{formatCents(line.unitPriceCents)} each</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <Step
                    label={`One fewer ${line.name}`}
                    onClick={() => update(setQty(cart, line.id, line.qty - 1))}
                  >
                    −
                  </Step>
                  <span className="mono" style={{ minWidth: "2ch", textAlign: "center" }}>
                    {line.qty}
                  </span>
                  <Step
                    label={`One more ${line.name}`}
                    onClick={() => update(setQty(cart, line.id, line.qty + 1))}
                  >
                    +
                  </Step>
                </div>
                <p className="mono" style={{ minWidth: "5ch", textAlign: "right" }}>
                  {formatCents(line.unitPriceCents * line.qty)}
                </p>
              </div>
            </div>

            {/* A note for the kitchen. The plumbing was already complete — cart →
                place_order → order_items.notes → the docket, where Docket.tsx renders
                it in warning colour with a `!`. There was simply no input anywhere in
                the app, so the field could only ever be empty. */}
            <NoteField
              line={line}
              onCommit={(notes) =>
                update(
                  setNotes(cart, line.id, notes),
                  notes.trim()
                    ? `Note saved for ${line.name}`
                    : `Note removed from ${line.name}`,
                )
              }
            />
          </li>
        ))}
      </ul>

      <dl style={{ margin: "var(--space-5) 0", display: "grid", gap: "var(--space-2)" }}>
        <Row label="Subtotal" value={formatCents(subtotal)} />
        <Row label={`Tax (${formatRate(taxRate)})`} value={formatCents(tax)} />
        <Row label="Total" value={formatCents(subtotal + tax)} strong />
      </dl>
      <p className="eyebrow" style={{ marginBottom: "var(--space-4)" }}>
        The kitchen confirms the final total
      </p>

      {!signedIn ? (
        <Link
          href={"/auth/sign-in?returnTo=/cart" as never}
          role="button"
          style={{
            display: "flex",
            minHeight: "52px",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent)",
            color: "var(--color-accent-fg)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Sign in to order
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void placeOrder()}
          disabled={busy || problems.length > 0}
          aria-busy={busy}
          style={{
            width: "100%",
            minHeight: "52px",
            borderRadius: "var(--radius-md)",
            border: "none",
            background:
              problems.length > 0 ? "var(--color-bg-raised)" : "var(--color-accent)",
            color: problems.length > 0 ? "var(--color-fg-subtle)" : "var(--color-accent-fg)",
            font: "inherit",
            fontWeight: 600,
            fontSize: "var(--text-step-0)",
            cursor: busy ? "progress" : problems.length > 0 ? "not-allowed" : "pointer",
          }}
        >
          {busy ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              {/* The wording was already right; there was just nothing moving beside it.
                  place_order() locks rows, re-checks availability and writes the ledger,
                  so this is a real second or two on a phone in a restaurant. */}
              <Spinner label="Sending to the kitchen" />
              Sending to the kitchen…
            </span>
          ) : problems.length > 0 ? (
            "Fix the items above"
          ) : (
            "Place order"
          )}
        </button>
      )}
    </section>
  );
}

/**
 * A note for one line, collapsed until asked for.
 *
 * Local state, committed on blur rather than on every keystroke: writeCart persists to
 * localStorage and fires the shared live region, and doing that per character would
 * make a screen reader read the cart total after every letter.
 *
 * Capped at 120 characters because the destination is a kitchen docket read at two
 * metres, not a message box. A paragraph there pushes the next ticket off the screen.
 */
function NoteField({
  line,
  onCommit,
}: {
  line: CartLine;
  onCommit: (notes: string) => void;
}) {
  const [open, setOpen] = useState(Boolean(line.notes));
  const [text, setText] = useState(line.notes ?? "");
  const inputId = `note-${line.id}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="eyebrow"
        style={{
          marginTop: "var(--space-2)",
          padding: 0,
          border: "none",
          background: "none",
          color: "var(--color-accent)",
          font: "inherit",
          fontSize: "var(--text-step--1)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        + Note for the kitchen
      </button>
    );
  }

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <label className="eyebrow" htmlFor={inputId}>
        Note for the kitchen
      </label>
      <input
        id={inputId}
        type="text"
        value={text}
        maxLength={120}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="No chilli, please"
        style={{
          width: "100%",
          minHeight: "44px",
          marginTop: "var(--space-2)",
          padding: "0 var(--space-3)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border-strong)",
          background: "var(--color-bg-sunken)",
          color: "var(--color-fg)",
          font: "inherit",
          fontSize: "var(--text-step--1)",
        }}
      />
      {/* Not .eyebrow: that uppercases, which is right for a three-word label and wrong
          for a sentence — two lines of shouting for a quiet aside. */}
      <p
        style={{
          marginTop: "var(--space-1)",
          color: "var(--color-fg-subtle)",
          fontSize: "var(--text-step--1)",
        }}
      >
        The kitchen sees this on the ticket. It can&rsquo;t change allergens.
      </p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <dt style={{ color: strong ? "var(--color-fg)" : "var(--color-fg-muted)" }}>{label}</dt>
      <dd
        className="mono"
        style={{ margin: 0, fontWeight: strong ? 600 : 400, fontSize: strong ? "var(--text-step-1)" : undefined }}
      >
        {value}
      </dd>
    </div>
  );
}

function Fix({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: "44px",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-strong)",
        background: "transparent",
        color: "var(--color-fg)",
        font: "inherit",
        fontSize: "var(--text-step--1)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Step({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: "44px",
        height: "44px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-strong)",
        background: "transparent",
        color: "var(--color-fg)",
        font: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
