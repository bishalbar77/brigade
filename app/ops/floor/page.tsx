import { Cell, Empty, OpsHeader, Pill, ScopeNote, StaffOnly, Table } from "@/components/ops/ReadOnly";
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
            <h2
              style={{
                fontSize: "var(--text-step-0)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "var(--space-3)",
              }}
            >
              {zone.zone}
            </h2>

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

      <section style={{ marginTop: "var(--space-6)" }}>
        <h2 className="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
          Open tables in detail
        </h2>
        {floor.zones.flatMap((z) => z.tables).filter((t) => t.status === "seated").length === 0 ? (
          <Empty>Nothing seated right now.</Empty>
        ) : (
          <Table head={["Table", "Zone", "#Seats", "#Sitting", "#Away", "State"]}>
            {floor.zones
              .flatMap((z) => z.tables)
              .filter((t) => t.status === "seated")
              .sort((a, b) => (b.dwellMinutes ?? 0) - (a.dwellMinutes ?? 0))
              .map((t) => (
                <tr key={t.id}>
                  <Cell strong>{t.label}</Cell>
                  <Cell tone="muted">{t.zone}</Cell>
                  <Cell numeric>{t.seats}</Cell>
                  <Cell numeric tone={(t.dwellMinutes ?? 0) > 100 ? "warn" : undefined}>
                    {t.dwellMinutes}m
                  </Cell>
                  <Cell numeric tone="muted">
                    {t.itemsAway}/{t.itemsTotal}
                  </Cell>
                  <Cell>
                    <Pill tone={STATUS_TONE[t.status]}>{t.status}</Pill>
                  </Cell>
                </tr>
              ))}
          </Table>
        )}
      </section>
    </LiveFrame>
  );
}
