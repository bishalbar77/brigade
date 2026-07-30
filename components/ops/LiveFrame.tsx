"use client";

import { createContext, useContext } from "react";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";

/**
 * Wraps a read-only ops screen so it still updates live.
 *
 * "Read-only" means no writes originate from the screen — not that it's static. A
 * floor map or pantry list showing stale numbers during service is worse than one
 * that admits it's stale, and the subscription is free once the hook exists.
 *
 * The channel name is scoped per surface so each screen holds exactly one channel,
 * and it's torn down on unmount. Free-tier connection limits are real, and a leak on
 * navigation kills realtime for every client.
 */

/**
 * Whether the subscription is actually up.
 *
 * `null` means "not inside a LiveFrame at all", which is not the same as `false`
 * ("was subscribed, then dropped"). A page that never claimed to be live must not
 * start saying "reconnecting".
 *
 * This context exists because the connection state was being thrown on the floor.
 * `useRealtimeRefresh` has always returned `{ live }`; `LiveFrame` ignored it; and
 * `OpsHeader` had a `live` prop that no page ever passed. So three screens held an open
 * realtime channel and refreshed under the reader with no sign either that they were
 * live or that they had stopped being. Going through context means `OpsHeader` picks it
 * up wherever it sits, with nothing to wire per page and nothing to forget on the next
 * screen someone adds.
 */
const LiveContext = createContext<boolean | null>(null);

export function useLive(): boolean | null {
  return useContext(LiveContext);
}

export function LiveFrame({
  channel,
  tables,
  children,
}: {
  channel: string;
  tables: readonly string[];
  children: React.ReactNode;
}) {
  const { live } = useRealtimeRefresh(`brigade:${channel}`, tables);
  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

/**
 * "listening" / "reconnecting", or nothing at all.
 *
 * A client LEAF rather than part of OpsHeader, deliberately. OpsHeader is a server
 * component and must stay one: `Table` sits in the same module and takes `hrefFor`, a
 * FUNCTION prop, which cannot cross a server-to-client boundary. So only the two words
 * that need the context are client-side.
 *
 * Renders nothing outside a LiveFrame — a screen that makes no live claim should not
 * report on a connection it never opened.
 */
export function LiveBadge({ style }: { style?: React.CSSProperties }) {
  const live = useLive();
  if (live === null) return null;
  return (
    <p
      className="eyebrow"
      // Not colour alone: the word itself changes, which is the whole signal.
      style={{ color: live ? "var(--color-fg-subtle)" : "var(--color-runway-low)", ...style }}
    >
      {live ? "listening" : "reconnecting"}
    </p>
  );
}
