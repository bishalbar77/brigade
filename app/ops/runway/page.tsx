import Link from "next/link";
import { RunwayBoard } from "@/components/ops/RunwayBoard";
import { getRunwayBoard } from "@/lib/data/ops";
import { getCurrentProfile } from "@/lib/supabase/server";

/*
 * The runway board. Never cut — this screen IS the differentiation claim.
 *
 * Existing tills tell you a dish IS out. This tells you WHEN it will be, while
 * there is still time to prep more, adjust the menu, or brief the floor. Every
 * row names the binding ingredient, because "branzino 86s at 20:40" is information
 * and "because you have four lemons" is something a chef can act on.
 */

export const dynamic = "force-dynamic";

export default async function RunwayPage() {
  const profile = await getCurrentProfile();

  if (!profile || profile.role === "guest") {
    return (
      <section style={{ padding: "var(--space-6)", maxWidth: "34rem" }}>
        <h1 style={{ fontSize: "var(--text-step-2)" }}>Staff only</h1>
        <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
          Sign in with a staff account to see what&rsquo;s about to run out.
        </p>
        <Link href="/auth/sign-in" style={{ color: "var(--color-accent)" }}>
          Sign in →
        </Link>
      </section>
    );
  }

  const board = await getRunwayBoard();

  return (
    <RunwayBoard
      restaurantId={board.restaurantId}
      rows={board.rows}
      serviceOpen={board.serviceOpen}
      daypart={board.daypart}
      canAdjustStock={profile.role === "owner" || profile.role === "manager"}
    />
  );
}
