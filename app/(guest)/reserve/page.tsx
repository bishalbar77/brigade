import { ReserveView, type Slot } from "@/components/guest/ReserveView";
import { windowsForDate } from "@/lib/data/menu";
import { resolveTimeZone } from "@/lib/runway/clock";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * Booking + walk-in queue.
 *
 * Slots are generated from the restaurant's real service_hours IN ITS OWN TIMEZONE,
 * then marked unavailable where the book already holds every table that fits. The
 * greying is convenience; the API re-checks capacity, because a request that skips
 * this page must still be refused.
 */

export const dynamic = "force-dynamic";

const SLOT_MINUTES = 30;
const DAYS_AHEAD = 4;

export default async function ReservePage() {
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, timezone, service_hours")
    .limit(1)
    .single();

  if (!restaurant) {
    return (
      <section style={{ padding: "var(--space-6) var(--space-4)" }}>
        <h1 style={{ fontSize: "var(--text-step-2)" }}>Bookings are unavailable</h1>
        <p style={{ color: "var(--color-fg-muted)" }}>Please try again shortly.</p>
      </section>
    );
  }

  const timeZone = resolveTimeZone(restaurant.timezone as string | null);
  const now = new Date();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Everything booked across the horizon, so slots can be greyed without N queries.
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + DAYS_AHEAD + 1);

  // restaurant_table_count and reservation_load, not `tables` and `reservations`.
  // A diner cannot read either table — tables_read is staff-only and
  // reservations_read_own shows them only their own — so querying them here returned
  // no tables and no bookings, and this page drew every slot as free while the API
  // refused all of them. See supabase/patches/005_booking_capacity.sql.
  const [{ data: capacity }, { data: booked }, { data: myQueue }] = await Promise.all([
    supabase
      .from("restaurant_table_count")
      .select("table_count")
      .eq("restaurant_id", restaurant.id)
      .maybeSingle(),
    supabase
      .from("reservation_load")
      .select("requested_at, party_size")
      .eq("restaurant_id", restaurant.id)
      .gte("requested_at", now.toISOString())
      .lte("requested_at", horizonEnd.toISOString()),
    user
      ? supabase
          .from("queue_entries")
          .select("quoted_minutes, joined_at")
          .eq("guest_id", user.id)
          .in("status", ["waiting", "notified"])
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const tableCount = (capacity as { table_count: number } | null)?.table_count ?? 1;

  const days: { key: string; label: string; slots: Slot[]; closed: boolean }[] = [];

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);

    const windows = windowsForDate(
      (restaurant.service_hours ?? {}) as never,
      date,
      timeZone,
    );

    const slots: Slot[] = [];
    for (const w of windows) {
      for (let m = w.startMinutes; m + SLOT_MINUTES <= w.endMinutes; m += SLOT_MINUTES) {
        const at = new Date(date);
        at.setHours(Math.floor(m / 60), m % 60, 0, 0);
        if (at.getTime() < now.getTime() + 30 * 60_000) continue; // no booking the past

        // A slot is full when bookings within ±90 min already hold every table.
        const clash = (booked ?? []).filter((b) => {
          const diff = Math.abs(new Date(b.requested_at as string).getTime() - at.getTime());
          return diff <= 90 * 60_000;
        }).length;

        slots.push({
          iso: at.toISOString(),
          label: at.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone,
          }),
          available: clash < tableCount,
        });
      }
    }

    days.push({
      key: `d${d}`,
      label:
        d === 0
          ? "Today"
          : date.toLocaleDateString("en-GB", { weekday: "short", timeZone }),
      slots,
      // "No windows at all" and "windows existed but every slot has passed" are
      // different facts and need different copy. Conflating them tells a guest the
      // kitchen is shut when really they're just booking too late in the evening.
      closed: windows.length === 0,
    });
  }

  const queueRow = (myQueue as { quoted_minutes: number | null } | null) ?? null;

  return (
    <ReserveView
      restaurantId={restaurant.id as string}
      days={days}
      signedIn={Boolean(user)}
      existingQueue={
        queueRow ? { position: 1, quotedMinutes: queueRow.quoted_minutes } : null
      }
    />
  );
}
