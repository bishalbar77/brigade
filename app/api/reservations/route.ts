import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Book a table.
 *
 * Capacity is checked HERE rather than trusted from the picker: the greyed-out slots
 * in the UI are convenience, and a request that skips the UI must still be refused.
 */
export async function POST(request: Request) {
  let body: { restaurantId?: string; partySize?: number; requestedAt?: string; guestName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }

  const { restaurantId, partySize, requestedAt, guestName } = body;
  if (!restaurantId || !Number.isInteger(partySize) || partySize! < 1 || !requestedAt) {
    return NextResponse.json(
      { code: "BAD_REQUEST", message: "Pick a party size and a time." },
      { status: 400 },
    );
  }

  const when = new Date(requestedAt);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { code: "BAD_TIME", message: "Choose a time in the future." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { code: "NOT_AUTHENTICATED", message: "Sign in to book a table." },
      { status: 401 },
    );
  }

  // Capacity for the window: tables that fit, minus bookings already holding one.
  const windowStart = new Date(when.getTime() - 90 * 60_000).toISOString();
  const windowEnd = new Date(when.getTime() + 90 * 60_000).toISOString();

  const [{ count: fitting }, { count: taken }] = await Promise.all([
    supabase
      .from("tables")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .gte("seats", partySize!),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .in("status", ["booked", "seated"])
      .gte("requested_at", windowStart)
      .lte("requested_at", windowEnd),
  ]);

  if ((fitting ?? 0) - (taken ?? 0) <= 0) {
    return NextResponse.json(
      {
        code: "NO_CAPACITY",
        message: "That time is fully booked. Try another, or join the walk-in queue.",
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      restaurant_id: restaurantId,
      guest_id: user.id,
      guest_name: guestName ?? "",
      party_size: partySize,
      requested_at: when.toISOString(),
      source: "web",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ code: "ERROR", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ reservationId: data.id }, { status: 201 });
}
