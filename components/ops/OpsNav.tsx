"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The ops nav, at both widths.
 *
 * I argued against a hamburger here on the grounds that Rahul reads this at two metres
 * with no mouse and busy hands, and hiding one-tap navigation behind a tap-to-open panel
 * would cost him the thing that makes it usable. That reasoning was right about a WALL
 * SCREEN and I over-applied it: a wall-mounted KDS is never 640px wide. Below that
 * breakpoint there is no wall screen and no Rahul — there is Meera checking the numbers on
 * the way home and Tom counting stock in the store cupboard, both on phones, where seven
 * tabs in a scrolling strip is worse than a menu.
 *
 * So: the full strip stays, unchanged, at every width a wall screen could be. The phone
 * gets a hamburger. Nothing about the 2m case changes.
 *
 * The current page is marked with aria-current and shown in the button's own label, so on
 * a phone you can still tell where you are without opening anything — which is the thing
 * a hamburger normally takes away.
 */

export interface NavItem {
  href: string;
  label: string;
  hint: string;
}

export function OpsNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
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

  const isCurrent = (href: string) =>
    pathname === href || (href !== "/ops/kds" && pathname.startsWith(href));
  const current = items.find((i) => isCurrent(i.href));

  return (
    <>
      {/* Wide — the wall-screen case. A tap strip, everything visible at rest. */}
      <nav className="scroll-x ops-nav-wide" aria-label="Sections">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href as never}
            aria-current={isCurrent(item.href) ? "page" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              padding: "var(--space-2) var(--space-4)",
              minHeight: "52px",
              justifyContent: "center",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${isCurrent(item.href) ? "var(--color-accent)" : "var(--color-border)"}`,
              background: "var(--color-bg-raised)",
              color: "var(--color-fg)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
              {item.label}
            </span>
            <span className="eyebrow" style={{ fontSize: "0.7rem" }}>
              {item.hint}
            </span>
          </Link>
        ))}
      </nav>

      {/* Phone — one button, and it names where you are. */}
      <div className="ops-nav-narrow">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="ops-nav-panel"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            minHeight: "48px",
            padding: "0 var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border-strong)",
            background: open ? "var(--color-bg-raised)" : "transparent",
            color: "var(--color-fg)",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          <span aria-hidden="true" style={{ display: "grid", gap: "4px", width: "18px" }}>
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
          {/* Naming the section is what stops a hamburger costing you your bearings. */}
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
            {current?.label ?? "Sections"}
          </span>
        </button>
      </div>

      {open && (
        <div
          className="nav-panel ops-nav-panel"
          id="ops-nav-panel"
          ref={panelRef}
          role="group"
          aria-label="Sections"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href as never}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              style={{
                justifyContent: "space-between",
                background: isCurrent(item.href) ? "var(--color-bg-sunken)" : "transparent",
              }}
            >
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
                {item.label}
              </span>
              <span className="eyebrow" style={{ fontSize: "0.7rem" }}>
                {item.hint}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
