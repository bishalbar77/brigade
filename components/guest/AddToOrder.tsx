"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addLine, readCart, writeCart } from "@/lib/cart";

/*
 * Quantity stepper and add-to-order.
 *
 * The stepper is capped at what's actually available, so an impossible order can't
 * even be composed. That is not a substitute for the server check — between here and
 * the submit another table can take the last portion — but it stops the common case
 * becoming an error the guest has to recover from.
 */
export function AddToOrder({
  dishId,
  name,
  unitPriceCents,
  portions,
  unlimited,
  disabled,
  disabledReason,
}: {
  dishId: string;
  name: string;
  unitPriceCents: number;
  portions: number;
  unlimited: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const max = unlimited ? 20 : Math.min(portions, 20);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // If availability drops while this page is open, don't let a stale quantity sit
  // in the stepper waiting to fail.
  useEffect(() => {
    if (qty > max) setQty(Math.max(1, max));
  }, [max, qty]);

  if (disabled) {
    return (
      <div
        style={{
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          color: "var(--color-fg-muted)",
        }}
      >
        <p>{disabledReason ?? "This isn't available right now."}</p>
      </div>
    );
  }

  function add() {
    const cart = addLine(readCart(), { dishId, name, unitPriceCents }, qty);
    // The announcement names the dish and the quantity, because the button label
    // changing to "Added" is not something a screen reader reports.
    writeCart(cart, `${qty} × ${name} added`);
    setAdded(true);
    // "Added" used to be a one-way door: it was set once and never cleared, so a
    // second tap changed nothing on screen and read as a tap that did not land.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span className="eyebrow" id="qty-label">
          How many
        </span>
        <div
          role="group"
          aria-labelledby="qty-label"
          style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
        >
          <Step label="One fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
            −
          </Step>
          <span className="mono" style={{ minWidth: "2ch", textAlign: "center", fontSize: "var(--text-step-1)" }}>
            {qty}
          </span>
          <Step label="One more" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max}>
            +
          </Step>
        </div>
        {!unlimited && qty >= max && (
          <span style={{ color: "var(--color-runway-low)", fontSize: "var(--text-step--1)" }}>
            that&rsquo;s all of them
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={add}
        style={{
          minHeight: "52px",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: added ? "var(--color-ok)" : "var(--color-accent)",
          color: "var(--color-accent-fg)",
          font: "inherit",
          fontWeight: 600,
          fontSize: "var(--text-step-0)",
          cursor: "pointer",
        }}
      >
        {/* The label matches the outcome: "Add to order" produces "Added". */}
        {added ? "Added" : "Add to order"}
      </button>
    </div>
  );
}

function Step({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "48px",
        height: "48px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-strong)",
        background: "transparent",
        color: disabled ? "var(--color-fg-subtle)" : "var(--color-fg)",
        font: "inherit",
        fontSize: "var(--text-step-1)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
