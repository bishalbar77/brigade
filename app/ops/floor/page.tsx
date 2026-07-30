import {
  Empty,
  OpsHeader,
  Pill,
  ScopeNote,
  SectionHeading,
  StaffOnly,
} from "@/components/ops/ReadOnly";
import { LiveFrame } from "@/components/ops/LiveFrame";
import { getFloor } from "@/lib/data/reports";
import { getCurrentProfile } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth/roles";

/*
 * Floor map. Read-only by design — see the UI spec, decision D1.
 *
 * Zones render as a grouped layout rather than a literal floor plan: real
 * coordinates cost more than they're worth here, and a grid reads faster anyway.
 * Stated in-page so it doesn't look like an omission.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  open: "ok",
  seated: "info",
  dirty: "warn",
  held: "neutral",
} as const;

export default async function FloorPage() {
  const profile = await getCurrentProfile();
  if (!isStaff(profile?.role)) return <StaffOnly what="the floor" />;

  const floor = await getFloor();
  const total = floor.zones.reduce((n, z) => n + z.tables.length, 0);

  return (
    <LiveFrame channel="floor" tables={["tables", "orders"]}>
      {/*
        The "Open tables in detail" table that used to sit at the bottom of this page is
        gone. Its six columns — table, zone, seats, sitting, away, state — were every
        field already printed on the cards above it, sorted differently. A second full
        screen of the same data reads as more information and is none.
      */}
      <div className="ops-measure">
      <OpsHeader
        title="Floor"
        subtitle="Every table, its state, and how long the party has been sitting. Dwell time is what the walk-in wait quote is built from."
        stats={[
          { label: "covers seated", value: String(floor.covers) },
          { label: "tables open", value: `${floor.openTables}/${total}` },
        ]}
      />

      <ScopeNote action={{ href: "/ops/reservations", label: "Bookings and queue" }}>
        This view is read-only. Seating a party, bussing a table and reassigning a server are
        floor actions handled at the host stand.
      </ScopeNote>

      {total === 0 ? (
        <Empty>No tables configured yet.</Empty>
      ) : (
        floor.zones.map((zone) => (
          <section key={zone.zone} style={{ marginBottom: "var(--space-6)" }}>
            <SectionHeading meta={`${zone.tables.length} tables`}>{zone.zone}</SectionHeading>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {zone.tables.map((t) => (
                <article
                  key={t.id}
                  style={{
                    border: `1px solid ${
                      t.status === "dirty"
                        ? "var(--color-runway-low)"
                        : "var(--color-border-strong)"
                    }`,
                    borderRadius: "var(--radius-md)",
                    background:
                      t.status === "seated" ? "var(--color-bg-raised)" : "transparent",
                    padding: "var(--space-3)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 800,
                        fontSize: "var(--text-step-1)",
                      }}
                    >
                      {t.label}
                    </p>
                    <p className="eyebrow">{t.seats} seats</p>
                  </div>

                  <p style={{ marginTop: "var(--space-2)" }}>
                    <Pill tone={STATUS_TONE[t.status]}>{t.status}</Pill>
                  </p>

                  {t.status === "seated" && (
                    <p
                      className="mono"
                      style={{
                        marginTop: "var(--space-2)",
                        fontSize: "var(--text-step--1)",
                        color: "var(--color-fg-muted)",
                      }}
                    >
                      {t.dwellMinutes}m in
                      {t.itemsTotal > 0 && ` · ${t.itemsAway}/${t.itemsTotal} away`}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))
      )}
      </div>
    </LiveFrame>
  );
}
