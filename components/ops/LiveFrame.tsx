"use client";

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
export function LiveFrame({
  channel,
  tables,
  children,
}: {
  channel: string;
  tables: readonly string[];
  children: React.ReactNode;
}) {
  useRealtimeRefresh(`brigade:${channel}`, tables);
  return <>{children}</>;
}
