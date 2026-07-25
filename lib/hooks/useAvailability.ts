"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Live availability for a restaurant's menu.
 *
 * Subscribes to `ingredients` (migration 011 puts it in the realtime publication,
 * because stock movement is what changes portions) and refetches `menu_public` on
 * change. It does NOT recompute portions client-side: that would need the bill of
 * materials and ingredient stock, which a guest deliberately cannot read. The view
 * already computes it, so we ask the view.
 *
 * Changes arrive in bursts — one order depletes several ingredients — so refetches
 * are debounced into a single query.
 *
 * Returns the changed dish ids alongside the portions so the UI can mark exactly
 * what moved. A silent change reads as a static page; that's the demo moment.
 *
 * One channel, unsubscribed on unmount. Free-tier connection limits are real, and
 * a leak on navigation kills realtime for every client.
 */

export interface Availability {
  portions: number;
  manually86: boolean;
  unlimited: boolean;
}

const DEBOUNCE_MS = 350;
/** How long a dish stays marked as recently-changed. */
const FLASH_MS = 2000;

export function useAvailability(
  restaurantId: string,
  initial: Record<string, Availability>,
): { availability: Record<string, Availability>; changed: Set<string>; live: boolean } {
  const [availability, setAvailability] = useState(initial);
  const [changed, setChanged] = useState<Set<string>>(() => new Set());
  const [live, setLive] = useState(false);

  // Kept in a ref so the debounced refetch always diffs against current state
  // without re-subscribing every time portions change.
  const currentRef = useRef(availability);
  currentRef.current = availability;

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("menu_public")
      .select("id, portions, manually_86, unlimited")
      .eq("restaurant_id", restaurantId);

    if (error || !data) return;

    const next: Record<string, Availability> = {};
    const moved = new Set<string>();

    for (const row of data) {
      const id = row.id as string;
      next[id] = {
        portions: row.portions as number,
        manually86: Boolean(row.manually_86),
        unlimited: Boolean(row.unlimited),
      };
      const before = currentRef.current[id];
      if (before && before.portions !== next[id]!.portions) moved.add(id);
    }

    setAvailability(next);
    if (moved.size > 0) setChanged(moved);
  }, [restaurantId]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`restaurant:${restaurantId}:availability`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ingredients" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refetch(), DEBOUNCE_MS);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    // Realtime can drop silently in a tunnel or a lift. Self-heal rather than
    // sitting on stale state: a menu showing yesterday's counts is a lie.
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, refetch]);

  // Clear the flash marks after the animation has had time to land.
  useEffect(() => {
    if (changed.size === 0) return;
    const t = setTimeout(() => setChanged(new Set()), FLASH_MS);
    return () => clearTimeout(t);
  }, [changed]);

  return { availability, changed, live };
}
