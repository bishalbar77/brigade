import Link from "next/link";

/*
 * Ops shell. Rahul: wall screen read at ~2 METRES, hot bright kitchen, glare on
 * a grease-filmed screen, hands busy, NO MOUSE, 8-hour session.
 *
 * Consequences that are structural rather than stylistic:
 *   - no hover-only affordances; everything is visible at rest
 *   - nav is a tap strip, not a dropdown
 *   - kitchen vernacular is CORRECT here — the pass, 86, fire, docket are what
 *     staff actually say. Plain language belongs on guest surfaces.
 *   - dense in space, LARGE in type. [data-density="ops"] does both.
 */

const NAV = [
  { href: "/ops/kds", label: "The pass", hint: "dockets" },
  { href: "/ops/runway", label: "Runway", hint: "what's about to 86" },
  { href: "/ops/floor", label: "Floor", hint: "tables" },
  { href: "/ops/inventory", label: "Pantry", hint: "stock" },
  { href: "/ops/menu", label: "Menu", hint: "dishes & recipes" },
  { href: "/ops/reservations", label: "Bookings", hint: "covers" },
  { href: "/ops/analytics", label: "Service", hint: "numbers" },
] as const;

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-density="ops"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-5)",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "2px solid var(--color-border-strong)",
          background: "var(--color-bg-sunken)",
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/ops/kds"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "var(--text-step-1)",
            letterSpacing: "-0.03em",
            color: "var(--color-fg)",
            textDecoration: "none",
          }}
        >
          Brigade
        </Link>

        {/* Tap strip. No dropdowns — a cook with busy hands gets one tap. */}
        <nav
          className="scroll-x"
          style={{ display: "flex", gap: "var(--space-2)", flex: 1 }}
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                padding: "var(--space-2) var(--space-4)",
                minHeight: "52px",
                justifyContent: "center",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
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
      </header>

      <main style={{ flex: 1, padding: "var(--space-4)" }}>{children}</main>
    </div>
  );
}
