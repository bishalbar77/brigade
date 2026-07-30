"use client";

import { useEffect, useMemo, useState } from "react";
import { Docket } from "@/components/ops/Docket";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import {
  STATIONS,
  STATION_LABEL,
  filterDocketsByStation,
  ticketAgeMinutes,
  type Docket as DocketData,
  type Station,
  type Viewer,
} from "@/lib/ops/tickets";

const KDS_TABLES = ["order_items", "orders"] as const;

/*
 * The docket wall.
 *
 * Three things a wall screen needs that a page does not:
 *
 * 1. Ticket age must keep counting without a server round trip. A minute ticker
 *    updates `now` locally, so 19m becomes 20m and the escalation fires even if
 *    nothing changed in the database. Rendering age from a server timestamp alone
 *    would leave a docket frozen at the age it had when the page loaded.
 *
 * 2. It must survive an eight-hour service untouched. Realtime triggers a refresh
 *    rather than accumulating client state, completed dockets leave the board, and
 *    the channel is torn down on unmount.
 *
 * 3. Switching station must be INSTANT. It used to be a `?station=` link into a
 *    force-dynamic route: ~2.5 seconds of the previous station's tickets still on
 *    screen, with nothing to say a tap had landed. A cook does not wait — they tap
 *    again. The board now holds every open docket and narrows locally, so the header,
 *    the tabs and the filter all live here together rather than split across a server
 *    page that had to re-render to change a heading.
 */
export function KdsBoard({
  restaurantId,
  dockets,
  serviceOpen,
  initialStation,
  viewer,
}: {
  restaurantId: string;
  /** EVERY open docket. Narrowing happens here. */
  dockets: DocketData[];
  serviceOpen: boolean;
  /** From `?station=` or the chef's own station — where this cook starts. */
  initialStation: Station | null;
  /** Decides which actions are offered at all. See canAdvance in lib/ops/tickets.ts. */
  viewer: Viewer;
}) {
  const { live } = useRealtimeRefresh(`restaurant:${restaurantId}:kds`, KDS_TABLES);
  const [station, setStation] = useState<Station | null>(initialStation);

  // Age has to advance on its own. Ticking twice a minute is enough — a docket does
  // not need second-by-second precision, and a per-second timer on a screen left
  // open for eight hours is wasted work.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => filterDocketsByStation(dockets, station), [dockets, station]);

  // Counted from what is ON SCREEN, so the numbers agree with the tickets beneath them.
  const openItems = visible.reduce((n, d) => n + d.items.length, 0);
  const lateCount = visible.filter((d) => ticketAgeMinutes(d.openedAt, new Date(now)) >= 20).length;

  /** Per station, so a cook can see another section is drowning without switching to it. */
  const countFor = (s: Station | null) =>
    filterDocketsByStation(dockets, s).reduce((n, d) => n + d.items.length, 0);

  return (
    <>
      <header style={{ marginBottom: "var(--space-4)" }}>
        {/*
          Two rows, not one.
          Title, count and a six-tab strip used to share a single flex line and wrapped
          into each other at mid widths. The count belongs to the title; the tabs are a
          separate control and now get their own row.
        */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: "var(--text-step-2)" }}>
            {station ? STATION_LABEL[station] : "The pass"}
          </h1>

          <p className="mono" style={{ color: "var(--color-fg-muted)" }}>
            {openItems} on
            {lateCount > 0 && (
              <span style={{ color: "var(--color-runway-critical)", fontWeight: 600 }}>
                {" "}
                · {lateCount} late
              </span>
            )}
          </p>

          <p className="eyebrow" style={{ marginLeft: "auto" }}>
            {live ? "listening" : "reconnecting"}
          </p>
        </div>

        {/* Station filter as a tap strip: one tap, no dropdowns anywhere here. Buttons
            rather than links — nothing navigates, so nothing should look like it does. */}
        <nav
          aria-label="Station"
          className="scroll-x"
          style={{
            display: "flex",
            gap: "var(--space-2)",
            marginTop: "var(--space-3)",
            paddingBottom: "var(--space-1)",
          }}
        >
          <StationTab
            label="All"
            count={countFor(null)}
            active={station === null}
            onSelect={() => setStation(null)}
          />
          {STATIONS.map((s) => (
            <StationTab
              key={s}
              label={STATION_LABEL[s]}
              count={countFor(s)}
              active={station === s}
              onSelect={() => setStation(s)}
            />
          ))}
        </nav>
      </header>

      {visible.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--color-border-strong)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-6)",
            color: "var(--color-fg-muted)",
          }}
        >
          <p style={{ fontSize: "var(--text-step-1)", marginBottom: "var(--space-2)" }}>
            {station ? `Nothing on for ${STATION_LABEL[station]}.` : "Nothing on."}
          </p>
          <p style={{ fontSize: "var(--text-step--1)" }}>
            {/* Three different situations, three different sentences. "Nothing on" while
                another station has twelve tickets is a filter, not a quiet service. */}
            {station && dockets.length > 0
              ? "Other stations have tickets — tap All to see the whole pass."
              : serviceOpen
                ? "Dockets appear here the moment an order is placed."
                : "Service is closed. Dockets appear here when it opens."}
          </p>
        </div>
      ) : (
        <div className="kds-dockets">
          {visible.map((docket) => (
            <Docket key={docket.orderId} docket={docket} now={now} viewer={viewer} />
          ))}
        </div>
      )}
    </>
  );
}

function StationTab({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        flexShrink: 0,
        minHeight: "44px",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
        background: active ? "var(--color-accent)" : "transparent",
        color: active ? "var(--color-accent-fg)" : "var(--color-fg-muted)",
        font: "inherit",
        fontSize: "var(--text-step--1)",
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      {/* The load on each station, so you can see the grill is buried from the curry
          section. Monospace so switching tabs doesn't shift the strip under a thumb. */}
      <span
        className="mono"
        style={{ opacity: count === 0 ? 0.45 : 0.8 }}
        aria-label={`${count} item${count === 1 ? "" : "s"}`}
      >
        {count}
      </span>
    </button>
  );
}
