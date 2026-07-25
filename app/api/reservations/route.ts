import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Book a table.
 *
 * Delegates to `book_table()`. It used to make the capacity decision here, which was
 * wrong in a way that took an end-to-end test to see: `tables_read` requires
 * is_staff(), so counting "tables that fit this party" as the DINER returned zero, and
 * every booking was refused as fully booked. The rule needs data the caller may not
 * read, so it belongs in the database — the same reasoning as `place_order()` and
 * `join_queue()`. See supabase/patches/005_booking_capacity.sql.
 *
 * This route's whole job is now turning typed errors into something a hungry person
 * can act on.
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
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json(
      { code: "BAD_TIME", message: "Choose a time in the future." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("book_table", {
    p_restaurant_id: restaurantId,
    p_party_size: partySize,
    p_requested_at: when.toISOString(),
    p_guest_name: guestName ?? "",
  });

  if (error) {
    const raw = `${error.message ?? ""} ${(error as { details?: string }).details ?? ""}`;

    if (raw.includes("NOT_AUTHENTICATED")) {
      return NextResponse.json(
        { code: "NOT_AUTHENTICATED", message: "Sign in to book a table." },
        { status: 401 },
      );
    }
    if (raw.includes("BAD_TIME")) {
      return NextResponse.json(
        { code: "BAD_TIME", message: "Choose a time in the future." },
        { status: 400 },
      );
    }
    if (raw.includes("BAD_PARTY_SIZE")) {
      return NextResponse.json(
        { code: "BAD_PARTY_SIZE", message: "We can book parties of 1 to 20." },
        { status: 400 },
      );
    }
    // "No table here is that big" and "that hour is busy" send a guest to different
    // places, so they do not share a message.
    if (raw.includes("PARTY_TOO_LARGE")) {
      return NextResponse.json(
        {
          code: "NO_CAPACITY",
          message: "That party is larger than any single table. Call us and we'll join tables.",
        },
        { status: 409 },
      );
    }
    if (raw.includes("NO_CAPACITY")) {
      return NextResponse.json(
        {
          code: "NO_CAPACITY",
          message: "That time is fully booked. Try another, or join the walk-in queue.",
        },
        { status: 409 },
      );
    }
    if (raw.includes("ALREADY_BOOKED")) {
      return NextResponse.json(
        { code: "ALREADY_BOOKED", message: "You already have a table booked around then." },
        { status: 409 },
      );
    }
    return NextResponse.json({ code: "ERROR", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ reservationId: data }, { status: 201 });
}
