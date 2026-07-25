import Link from "next/link";
import { GuestNav } from "@/components/guest/GuestNav";
import { getCurrentProfile } from "@/lib/supabase/server";

/*
 * Guest shell. Priya: phone one-handed, dim loud room, ~30cm, 90 seconds.
 *
 * Plain language throughout — she does not know what "expo" or "the pass" mean.
 * Kitchen vernacular belongs on the ops surfaces only.
 *
 * The header carries the two things a diner needs at all times and previously had
 * neither of: where her order is (nothing linked to /cart at all), and who she is signed
 * in as. Reading the profile makes every guest route dynamic, which is correct — a
 * personalised header cannot be cached across people.
 */
export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
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

        <GuestNav name={profile?.full_name as string | null} />
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
