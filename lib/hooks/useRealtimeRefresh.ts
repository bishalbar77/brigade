"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe to table changes and re-render the server component tree.
 *
 * Deliberately refreshes rather than patching client state. The data logic — RLS,
 * joins, runway computation, station filtering — stays on the server in one place,
 * and a refresh re-runs all of it. Duplicating that reducer in the browser is how
 * a realtime UI drifts out of agreement with the database it claims to mirror.
 *
 * Changes arrive in bursts (one order writes several rows), so refreshes are
 * debounced into one.
 *
 * One channel, torn down on unmount. Free-tier connection limits are real: a leak
 * on navigation kills realtime for every client, and it looks like the feature
 * simply doesn't work.
 */
export function useRealtimeRefresh(
  channelName: string,
  tables: readonly string[],
  { debounceMs = 300 }: { debounceMs?: number } = {},
): { live: boolean } {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), debounceMs);
    };

    let channel = supabase.channel(channelName);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        bump,
      );
    }
    channel.subscribe((status) => setLive(status === "SUBSCRIBED"));

    // Realtime drops silently on flaky wifi. A KDS showing stale tickets is
    // actively dangerous, not just untidy — so self-heal on regaining focus.
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
    // `tables` is a literal array at every call site; joined to keep the dep stable.
  }, [channelName, tables.join(","), debounceMs, router]);

  return { live };
}
