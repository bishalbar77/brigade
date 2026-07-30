"use client";

import { useEffect, useRef, useState } from "react";
import { CART_EVENT, itemCount, readCart, type CartEventDetail } from "@/lib/cart";

/**
 * One live region for the whole guest shell.
 *
 * Adding a dish used to be completely silent to a screen reader: the count badge in
 * the header is `aria-hidden` (correctly — the link's own aria-label carries the
 * number), and the button label change from "Add to order" to "Added" is not
 * announced because the button is not the focused-and-changed element in a way AT
 * software reports. So the one thing a diner needs to know — it worked — reached
 * sighted users only.
 *
 * `polite`, not `assertive`: this is a confirmation, not an emergency, and assertive
 * would interrupt someone mid-sentence while they read the menu.
 *
 * Mounted in the layout so there is exactly ONE of these. Several live regions
 * competing is a well-known way to get nothing announced at all.
 */
export function CartAnnouncer() {
  const [message, setMessage] = useState("");
  // The first event after mount is our own sync, not a change the guest made.
  const ready = useRef(false);

  useEffect(() => {
    ready.current = true;

    const onChange = (event: Event) => {
      if (!ready.current) return;
      const detail = (event as CustomEvent<CartEventDetail>).detail;
      const count = itemCount(readCart());
      const items = `${count} item${count === 1 ? "" : "s"} in your order`;

      setMessage(
        detail?.announce
          ? `${detail.announce}. ${items}.`
          : count === 0
            ? "Your order is empty."
            : `${items}.`,
      );
    };

    window.addEventListener(CART_EVENT, onChange);
    return () => window.removeEventListener(CART_EVENT, onChange);
  }, []);

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
