import Link from "next/link";
import { KdsBoard } from "@/components/ops/KdsBoard";
import { RunwayRail } from "@/components/ops/RunwayRail";
import { STATIONS, STATION_LABEL, getKdsData, getRunwayBoard, type Station } from "@/lib/data/ops";
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
  const station: Station | null =
    requested && STATIONS.includes(requested)
      ? requested
      : profile.role === "chef" && profile.station
        ? (profile.station as Station)
        : null;

  const [kds, board] = await Promise.all([getKdsData(station), getRunwayBoard()]);

  const openItems = kds.dockets.reduce((n, d) => n + d.items.length, 0);
  const lateCount = kds.dockets.filter(
    (d) => Date.now() - new Date(d.openedAt).getTime() >= 20 * 60_000,
  ).length;

  return (
    <div style={{ display: "flex", alignItems: "stretch", minHeight: "70vh" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            marginBottom: "var(--space-4)",
          }}
        >
          <h1 style={{ fontSize: "var(--text-step-2)" }}>
            {station ? STATION_LABEL[station] : "The pass"}
          </h1>

          <p className="mono" style={{ color: "var(--color-fg-muted)" }}>
            {openItems} on
            {lateCount > 0 && (
              <span style={{ color: "var(--color-runway-critical)" }}> · {lateCount} late</span>
            )}
          </p>

          {/* Station filter as a tap strip: one tap, no dropdowns anywhere here. */}
          <nav
            className="scroll-x"
            style={{ display: "flex", gap: "var(--space-2)", marginLeft: "auto" }}
          >
            <StationTab href="/ops/kds" label="All" active={station === null} />
            {STATIONS.map((s) => (
              <StationTab
                key={s}
                href={`/ops/kds?station=${s}`}
                label={STATION_LABEL[s]}
                active={station === s}
              />
            ))}
          </nav>
        </header>

        <KdsBoard
          restaurantId={kds.restaurantId}
          dockets={kds.dockets}
          serviceOpen={kds.serviceOpen}
        />
      </div>

      <RunwayRail rows={board.rows} />
    </div>
  );
}

function StationTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href as never}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: "44px",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
        background: active ? "var(--color-accent)" : "transparent",
        color: active ? "var(--color-accent-fg)" : "var(--color-fg-muted)",
        textDecoration: "none",
        fontSize: "var(--text-step--1)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}
