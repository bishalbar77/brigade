import Link from "next/link";
import { KdsBoard } from "@/components/ops/KdsBoard";
import { RunwayRail } from "@/components/ops/RunwayRail";
import { STATIONS, getKdsData, getRunwayBoard, type Station } from "@/lib/data/ops";
import { getCurrentProfile } from "@/lib/supabase/server";

/*
 * The pass — the docket wall. Never cut (docs/06-roadmap.md).
 *
 * A chef lands here filtered to their own station; expo and managers work the whole
 * pass. The runway rail sits alongside so a cook sees what's cooking and what's
 * about to run out in one glance, without navigating away from the tickets.
 */

export const dynamic = "force-dynamic";

export default async function KdsPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const profile = await getCurrentProfile();

  // Presentation only — RLS is what actually withholds the rows. This is a better
  // explanation than an empty board.
  if (!profile || profile.role === "guest") {
    return (
      <section style={{ padding: "var(--space-6)", maxWidth: "34rem" }}>
        <h1 style={{ fontSize: "var(--text-step-2)" }}>Staff only</h1>
        <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
          The pass is for kitchen and floor staff. Sign in with a staff account to see
          tonight&rsquo;s dockets.
        </p>
        <Link href="/auth/sign-in" style={{ color: "var(--color-accent)" }}>
          Sign in →
        </Link>
      </section>
    );
  }

  const requested = stationParam as Station | undefined;
  const initialStation: Station | null =
    requested && STATIONS.includes(requested)
      ? requested
      : profile.role === "chef" && profile.station
        ? (profile.station as Station)
        : null;

  /*
   * EVERY docket, filtered on the client.
   *
   * This used to be `getKdsData(station)`, so each station tab was a `?station=` link and
   * a fresh `force-dynamic` render — measured at ~2.5s, during which the old board stayed
   * on screen with no sign anything was happening. Worse, it re-ran getRunwayBoard() too,
   * which does not depend on the station at all.
   *
   * `?station=` still works as a deep link and still seeds the board; it just stops being
   * rewritten on every tap. That is the trade: an instant filter, and a URL that reflects
   * where you arrived rather than where you have since looked.
   */
  const [kds, board] = await Promise.all([getKdsData(null), getRunwayBoard()]);

  return (
    <div className="kds-layout">
      <div className="kds-board">
        <KdsBoard
          restaurantId={kds.restaurantId}
          dockets={kds.dockets}
          serviceOpen={kds.serviceOpen}
          initialStation={initialStation}
          viewer={{ role: profile.role as string, station: profile.station as string | null }}
        />
      </div>

      <RunwayRail rows={board.rows} />
    </div>
  );
}
