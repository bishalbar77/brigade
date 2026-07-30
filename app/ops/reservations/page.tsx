import { LiveFrame } from "@/components/ops/LiveFrame";
import {
  Cell,
  Empty,
  OpsHeader,
  Pill,
  ScopeNote,
  SectionHeading,
  StaffOnly,
  Table,
} from "@/components/ops/ReadOnly";
import { getBookings } from "@/lib/data/reports";
import { getCurrentProfile } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth/roles";

/*
 * Bookings and the walk-in queue, on one screen because they compete for the same
 * tables. Read-only by design.
 *
 * The turn-time medians are shown deliberately: they're what the wait quote is built
 * from, so exposing them makes the quote inspectable rather than magic — and lets a
 * host override it with judgement when they know something the model doesn't.
 */

export const dynamic = "force-dynamic";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "critical" | "info"> = {
  booked: "info",
  seated: "ok",
  no_show: "critical",
  cancelled: "neutral",
  waiting: "info",
  notified: "warn",
};

export default async function ReservationsPage() {
  const profile = await getCurrentProfile();
  if (!isStaff(profile?.role)) return <StaffOnly what="tonight's book" />;

  const { bookings, queue, coversBooked, turnTimes } = await getBookings();

  const longestWait = queue.length > 0 ? Math.max(...queue.map((q) => q.waitedMinutes)) : 0;

  return (
    <LiveFrame channel="bookings" tables={["queue_entries", "orders", "tables"]}>
      <div className="ops-measure">
      <OpsHeader
        title="Bookings"
        subtitle="Tonight's book and the walk-in queue together, because both are competing for the same tables."
        stats={[
          { label: "covers booked", value: String(coversBooked) },
          {
            label: "waiting",
            value: String(queue.length),
            tone: queue.length > 3 ? "warn" : "normal",
          },
          {
            label: "longest wait",
            value: `${longestWait}m`,
            tone: longestWait > 30 ? "warn" : "normal",
          },
        ]}
      />

      <ScopeNote action={{ href: "/ops/floor", label: "Floor" }}>
        This view is read-only. Seating, no-shows and walk-in intake are host-stand actions.
      </ScopeNote>

      <section style={{ marginBottom: "var(--space-6)" }}>
        <SectionHeading meta={`${bookings.length} booking${bookings.length === 1 ? "" : "s"}`}>
          Tonight&rsquo;s book
        </SectionHeading>
        {bookings.length === 0 ? (
          <Empty>Nothing booked for today.</Empty>
        ) : (
          <Table head={["Time", "Name", "#Party", "Table", "State"]}>
            {bookings.map((b) => (
              <tr key={b.id}>
                <Cell numeric strong>
                  {clock(b.requestedAt)}
                </Cell>
                <Cell>{b.guestName}</Cell>
                <Cell numeric>{b.partySize}</Cell>
                <Cell tone="muted">{b.tableLabel ?? "unassigned"}</Cell>
                <Cell>
                  <Pill tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.replace("_", " ")}</Pill>
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section style={{ marginBottom: "var(--space-6)" }}>
        <SectionHeading meta={queue.length > 0 ? `${queue.length} waiting` : undefined}>
          Walk-in queue
        </SectionHeading>
        {queue.length === 0 ? (
          <Empty>Nobody waiting.</Empty>
        ) : (
          <Table head={["#", "Name", "#Party", "#Waited", "#Quoted", "State"]}>
            {queue.map((q, i) => (
              <tr key={q.id}>
                <Cell numeric tone="muted">
                  {i + 1}
                </Cell>
                <Cell>{q.guestName}</Cell>
                <Cell numeric>{q.partySize}</Cell>
                <Cell numeric tone={q.waitedMinutes > (q.quotedMinutes ?? 30) ? "critical" : undefined}>
                  {q.waitedMinutes}m
                </Cell>
                <Cell numeric tone="muted">
                  {q.quotedMinutes !== null ? `${q.quotedMinutes}m` : "—"}
                </Cell>
                <Cell>
                  <Pill tone={STATUS_TONE[q.status] ?? "neutral"}>{q.status}</Pill>
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        {/* Marked as reference so it stops competing with tonight's live book. These
            medians are six weeks of history; they do not change during service. */}
        <SectionHeading meta="reference · not live">
          How the wait is worked out
        </SectionHeading>
        <Table head={["Party size", "#Median turn", "#Sample"]}>
          {turnTimes.map((t) => (
            <tr key={t.bucket}>
              <Cell strong>{t.bucket}</Cell>
              <Cell numeric tone={t.medianMinutes === null ? "muted" : undefined}>
                {t.medianMinutes !== null ? `${t.medianMinutes}m` : "not enough history"}
              </Cell>
              <Cell numeric tone="muted">
                {t.sample}
              </Cell>
            </tr>
          ))}
        </Table>
        <p
          style={{
            marginTop: "var(--space-3)",
            color: "var(--color-fg-subtle)",
            fontSize: "var(--text-step--1)",
            maxWidth: "70ch",
          }}
        >
          Medians of real seated-to-paid durations at this restaurant, bucketed by party size — a
          two-top and a four-top turn differently, but 3 versus 4 is noise. Buckets with fewer
          than ten historical turns say so rather than presenting a default as a measurement.
        </p>
      </section>
      </div>
    </LiveFrame>
  );
}
