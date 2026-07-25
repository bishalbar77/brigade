"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Live availability for a restaurant's menu.
 *
 * ─── WHY THIS IS POLL-FIRST, NOT SUBSCRIBE-FIRST ─────────────────────────────
 *
 * The first version subscribed to `postgres_changes` on `ingredients` and treated
 * `status === "SUBSCRIBED"` as meaning "live". An audit proved that combination was
 * silently broken for the people it mattered most to:
 *
 *   Realtime authorises postgres_changes ROW BY ROW against the subscriber's own RLS.
 *   `ingredients_read` requires is_staff(), which is false for anon AND for role
 *   'guest'. So a guest's channel reported SUBSCRIBED and then received exactly zero
 *   events, forever — measured as guest 0 / staff 2 on the same stock change, twice.
 *
 * Two failures, and the second was worse than the first: the menu was frozen at
 * page-load values, and the pill said "live" while the page was deaf. The adjacent
 * copy — "counts change as other tables order" — was false on the one surface where
 * the product's whole claim lives.
 *
 * The fix is NOT to grant guests SELECT on `ingredients`; that would leak the pantry
 * to anyone. Instead:
 *
 *   1. A short interval refetches `menu_public`, which a guest CAN read. This works
 *      regardless of RLS, so the claim is true for everyone.
 *   2. The postgres_changes subscription is kept as an accelerator — staff surfaces
 *      get near-instant updates from it — but nothing depends on it.
 *   3. "live" now means A REFETCH ACTUALLY SUCCEEDED RECENTLY, never "a channel
 *      reported SUBSCRIBED". A status flag that can be true while no data flows is
 *      not a liveness signal.
 */

export interface Availability {
  portions: number;
  manually86: boolean;
  unlimited: boolean;
}

/** Burst coalescing: one order depletes several ingredients at once. */
const DEBOUNCE_MS = 350;
/** Poll cadence. Fast enough to feel live at a table, cheap enough to leave running. */
const POLL_MS = 12_000;
/** How long a dish stays marked as recently-changed. */
const FLASH_MS = 2000;
/** Beyond this since the last successful refetch, stop claiming to be live. */
const STALE_AFTER_MS = 40_000;

export function useAvailability(
  restaurantId: string,
  initial: Record<string, Availability>,
): { availability: Record<string, Availability>; changed: Set<string>; live: boolean } {
  const [availability, setAvailability] = useState(initial);
  const [changed, setChanged] = useState<Set<string>>(() => new Set());
  const [lastOkAt, setLastOkAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  // Kept in a ref so the refetch always diffs against current state without
  // re-subscribing every time portions change.
  const currentRef = useRef(availability);
  currentRef.current = availability;

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("menu_public")
      .select("id, portions, manually_86, unlimited")
      .eq("restaurant_id", restaurantId);

    // A failed refetch must NOT refresh lastOkAt — otherwise the pill would keep
    // claiming live while every request was failing.
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
    setLastOkAt(Date.now());
    if (moved.size > 0) setChanged(moved);
  }, [restaurantId]);

  // 1. The dependable path: poll. Works for anon, guests and staff alike.
  useEffect(() => {
    const id = setInterval(() => void refetch(), POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  // 2. The accelerator: realtime, where the subscriber's RLS permits it.
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
      .subscribe();

    // Self-heal after a tunnel, a lift, or a backgrounded tab.
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, refetch]);

  // Drives the pill off observed freshness rather than a connection flag.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Clear the flash marks once the animation has had time to land.
  useEffect(() => {
    if (changed.size === 0) return;
    const t = setTimeout(() => setChanged(new Set()), FLASH_MS);
    return () => clearTimeout(t);
  }, [changed]);

  return { availability, changed, live: now - lastOkAt < STALE_AFTER_MS };
}
