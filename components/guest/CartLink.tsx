"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readCart } from "@/lib/cart";

/**
 * The way to the cart.
 *
 * There wasn't one. `/cart` was built, tested and reachable only by typing the URL —
 * the guest header offered Menu, Book and Sign in, and "Add to order" put a dish
 * somewhere the diner could not then find. verify:features passed it by requesting the
 * path directly, which is the difference between testing a URL and testing a journey.
 *
 * Always rendered, even at zero, so the destination is discoverable BEFORE anything is
 * added — a control that appears only once you have guessed right is not an affordance.
 * The count is the accent when there is something in it, so the primary action shifts to
 * the cart the moment a diner has an order to place.
 *
 * Reads localStorage, so it renders 0 on the server and corrects on mount. The cart is
 * deliberately client-only (lib/cart.ts): it is a private intention, not an order.
 */
export function CartLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(readCart().lines.reduce((n, l) => n + l.qty, 0));
    sync();
    // `brigade:cart` for this tab — `storage` only fires in the others.
    window.addEventListener("brigade:cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("brigade:cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const has = count > 0;

  return (
    <Link
      href="/cart"
      aria-label={has ? `Your order, ${count} item${count === 1 ? "" : "s"}` : "Your order, empty"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        minHeight: "44px",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${has ? "transparent" : "var(--color-border)"}`,
        background: has ? "var(--color-accent)" : "transparent",
        color: has ? "var(--color-accent-fg)" : "var(--color-fg-muted)",
        fontWeight: has ? 600 : 400,
        textDecoration: "none",
        transition: "background var(--dur-fast), color var(--dur-fast)",
      }}
    >
      <span>Order</span>
      {has && (
        // Monospace so the number does not shift the button as it changes.
        <span
          className="mono"
          aria-hidden="true"
          style={{
            display: "inline-grid",
            placeItems: "center",
            minWidth: "1.5em",
            padding: "0 0.35em",
            borderRadius: "999px",
            background: "color-mix(in oklab, var(--color-accent-fg) 22%, transparent)",
            fontSize: "var(--text-step--1)",
            fontWeight: 700,
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
