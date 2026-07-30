import Link from "next/link";

/*
 * Shell for the auth screens.
 *
 * These routes sit outside the `(guest)` group, so until now they had NO layout at all.
 * Verified against the deployed site: `/auth/sign-in` and `/auth/verify` served **zero
 * links** — no wordmark, no nav, nothing. A first-time visitor who tapped "Sign in" had
 * exactly one way back to the menu, and it was the browser's Back button.
 *
 * That is worse here than anywhere else in the app, because signing in is the first thing
 * a new person does and the point at which they are least willing to feel stuck.
 *
 * Deliberately not the full guest nav. Menu / Book / Orders / cart on top of a sign-in
 * form invites someone to wander off mid-task; the wordmark alone is the one exit that
 * does not compete with the form. `data-density="guest"` is set explicitly because these
 * routes are outside the group that normally provides it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-density="guest"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
    >
      <a href="#main" className="skip-link">
        Skip to the form
      </a>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
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
      </header>

      <main id="main" style={{ flex: 1, width: "100%", maxWidth: "40rem", margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
