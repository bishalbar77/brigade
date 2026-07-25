import Link from "next/link";

/*
 * Guest shell. Priya: phone one-handed, dim loud room, ~30cm, 90 seconds.
 *
 * Plain language throughout — she does not know what "expo" or "the pass" mean.
 * Kitchen vernacular belongs on the ops surfaces only.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-density="guest"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          background: "color-mix(in oklab, var(--color-bg) 88%, transparent)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Link
          href="/"
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

        <nav style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <Link
            href="/menu"
            style={{ color: "var(--color-fg-muted)", textDecoration: "none" }}
          >
            Menu
          </Link>
          <Link
            href="/reserve"
            style={{ color: "var(--color-fg-muted)", textDecoration: "none" }}
          >
            Book
          </Link>
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
        </nav>
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: "40rem", margin: "0 auto" }}>
        {children}
      </main>

      <footer
        style={{
          padding: "var(--space-6) var(--space-4)",
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-fg-subtle)",
          fontSize: "var(--text-step--1)",
        }}
      >
        <p>Availability updates as the kitchen cooks.</p>
      </footer>
    </div>
  );
}
