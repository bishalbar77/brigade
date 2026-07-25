"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CartLink } from "@/components/guest/CartLink";

/**
 * The guest nav, at both widths.
 *
 * Priya holds the phone one-handed in a dim, loud room for about ninety seconds. Six
 * items in a row do not fit 375px, so below 560px everything except the cart collapses
 * behind one button.
 *
 * The cart is never collapsed. It is the action she is mid-way through, and it spent
 * this whole build unreachable — hiding it behind a tap again would be the same defect
 * wearing better clothes.
 *
 * Deliberately not a library: it is one button and one panel. What it does need is the
 * behaviour people expect from a menu and usually only half-get —
 *   - Escape closes it, and focus returns to the button that opened it
 *   - a tap anywhere outside closes it
 *   - navigating closes it (a panel still open over the page you just asked for reads
 *     as a broken tap)
 *   - aria-expanded and aria-controls, so it is announced as a menu rather than as an
 *     unlabelled button
 *   - no hover anywhere; the whole thing is tap and keyboard
 * The drop animation is CSS and is removed by the global prefers-reduced-motion rule.
 */
export function GuestNav({ name }: { name: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Navigating is a completed intent: the panel has done its job and should get out
  // of the way without being dismissed manually.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Returning focus matters: without it, Escape drops a keyboard user at the top
      // of the document with no idea where they were.
      buttonRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const firstName = name ? name.split(" ")[0] : null;

  return (
    <>
      {/* Wide: everything in a row, nothing hidden. */}
      <nav className="nav-wide" aria-label="Main">
        <Link href="/menu" style={{ color: "var(--color-fg-muted)", textDecoration: "none" }}>
          Menu
        </Link>
        <Link href="/reserve" style={{ color: "var(--color-fg-muted)", textDecoration: "none" }}>
          Book
        </Link>
        <CartLink />
        {firstName ? (
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ fontWeight: 600 }}>{firstName}</span>
            <form method="post" action="/auth/sign-out" style={{ margin: 0 }}>
              <button
                type="submit"
                style={{
                  minHeight: "44px",
                  padding: "0 var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-fg-muted)",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </form>
          </span>
        ) : (
          <Link
            href="/auth/sign-in"
            role="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0 var(--space-4)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent)",
              color: "var(--color-accent-fg)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
        )}
      </nav>

      {/* Narrow: the cart, then one button for the rest. */}
      <div className="nav-narrow">
        <CartLink />
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="guest-nav-panel"
          aria-label={open ? "Close menu" : "Open menu"}
          style={{
            display: "grid",
            placeItems: "center",
            width: "48px",
            height: "48px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: open ? "var(--color-bg-raised)" : "transparent",
            color: "var(--color-fg)",
            cursor: "pointer",
          }}
        >
          {/* Three bars that become a cross. aria-hidden because the button is labelled. */}
          <span
            aria-hidden="true"
            style={{ display: "grid", gap: "4px", width: "18px" }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  height: "2px",
                  background: "currentColor",
                  borderRadius: "2px",
                  transition: "transform var(--dur-fast), opacity var(--dur-fast)",
                  transform: open
                    ? i === 0
                      ? "translateY(6px) rotate(45deg)"
                      : i === 2
                        ? "translateY(-6px) rotate(-45deg)"
                        : undefined
                    : undefined,
                  opacity: open && i === 1 ? 0 : 1,
                }}
              />
            ))}
          </span>
        </button>
      </div>

      {open && (
        <div className="nav-panel" id="guest-nav-panel" ref={panelRef} role="group" aria-label="Main">
          <Link href="/menu">Menu</Link>
          <Link href="/reserve">Book a table</Link>
          <hr />
          {firstName ? (
            <>
              <span
                className="eyebrow"
                style={{ padding: "0 var(--space-3)", color: "var(--color-fg-subtle)" }}
              >
                Signed in as {name}
              </span>
              <form method="post" action="/auth/sign-out" style={{ margin: 0 }}>
                <button type="submit" style={{ width: "100%" }}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/auth/sign-in">Sign in</Link>
          )}
        </div>
      )}
    </>
  );
}
