import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Join the walk-in queue.
 *
 * `join_queue()` computes the quote server-side from other parties' rows and real
 * historical turn times — neither of which a guest can read. Computing it in the
 * browser would base the number on whatever fraction of the queue that guest happens
 * to be permitted to see.
 */
export async function POST(request: Request) {
  let body: { restaurantId?: string; partySize?: number; guestName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }

  if (!body.restaurantId || !Number.isInteger(body.partySize) || body.partySize! < 1) {
    return NextResponse.json(
      { code: "BAD_REQUEST", message: "How many people are joining you?" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("join_queue", {
    p_restaurant_id: body.restaurantId,
    p_party_size: body.partySize,
    p_guest_name: body.guestName ?? "",
  });

  if (error) {
    const raw = `${error.message ?? ""} ${(error as { details?: string }).details ?? ""}`;
    if (raw.includes("ALREADY_QUEUED")) {
      return NextResponse.json(
        { code: "ALREADY_QUEUED", message: "You're already in the queue." },
        { status: 409 },
      );
    }
    if (raw.includes("NOT_AUTHENTICATED")) {
      return NextResponse.json(
        { code: "NOT_AUTHENTICATED", message: "Sign in to join the queue." },
        { status: 401 },
      );
    }
    return NextResponse.json({ code: "ERROR", message: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json(
    { queueId: row?.queue_id, position: row?.position, quotedMinutes: row?.quoted_minutes },
    { status: 201 },
  );
}
