"use client";

import { useEffect, useState } from "react";
import { Docket } from "@/components/ops/Docket";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import type { Docket as DocketData } from "@/lib/ops/tickets";

const KDS_TABLES = ["order_items", "orders"] as const;

/*
 * The docket wall.
 *
 * Two things a wall screen needs that a page does not:
 *
 * 1. Ticket age must keep counting without a server round trip. A minute ticker
 *    updates `now` locally, so 19m becomes 20m and the escalation fires even if
 *    nothing changed in the database. Rendering age from a server timestamp alone
 *    would leave a docket frozen at the age it had when the page loaded.
 *
 * 2. It must survive an eight-hour service untouched. Realtime triggers a refresh
 *    rather than accumulating client state, completed dockets leave the board, and
 *    the channel is torn down on unmount.
 */
export function KdsBoard({
  restaurantId,
  dockets,
  serviceOpen,
}: {
  restaurantId: string;
  dockets: DocketData[];
  serviceOpen: boolean;
}) {
  const { live } = useRealtimeRefresh(`restaurant:${restaurantId}:kds`, KDS_TABLES);

  // Age has to advance on its own. Ticking once a minute is enough — a docket does
  // not need second-by-second precision, and a per-second timer on a screen left
  // open for eight hours is wasted work.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (dockets.length === 0) {
    return (
      <div
        style={{
          border: "1px dashed var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          color: "var(--color-fg-muted)",
        }}
      >
        <p style={{ fontSize: "var(--text-step-1)", marginBottom: "var(--space-2)" }}>
          Nothing on.
        </p>
        <p style={{ fontSize: "var(--text-step--1)" }}>
          {serviceOpen
            ? "Dockets appear here the moment an order is placed."
            : "Service is closed. Dockets appear here when it opens."}
        </p>
        <p className="eyebrow" style={{ marginTop: "var(--space-4)" }}>
          {live ? "listening" : "reconnecting"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="kds-dockets">
        {dockets.map((docket) => (
          <Docket key={docket.orderId} docket={docket} now={now} />
        ))}
      </div>
      <p className="eyebrow" style={{ marginTop: "var(--space-4)" }}>
        {live ? "listening" : "reconnecting"}
      </p>
    </>
  );
}
