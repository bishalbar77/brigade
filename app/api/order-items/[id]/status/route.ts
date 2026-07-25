import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Advance one order item's status.
 *
 * Delegates to `advance_item_status()`, which validates the transition server-side
 * and gates `plated → served` to expo. A cook's fat-finger must not be able to mark
 * food served that was never cooked, and that rule belongs in the database rather
 * than in whichever button happened to be rendered.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json({ code: "BAD_REQUEST", message: "status required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("advance_item_status", {
    p_item_id: id,
    p_to: body.status,
  });

  if (error) {
    // Typed errors from the function, mapped to codes the UI can act on rather
    // than a generic 500 that tells a cook nothing.
    const msg = error.message ?? "";
    if (msg.includes("ILLEGAL_TRANSITION")) {
      return NextResponse.json(
        { code: "ILLEGAL_TRANSITION", message: "That isn't the next step for this item." },
        { status: 409 },
      );
    }
    if (msg.includes("FORBIDDEN")) {
      return NextResponse.json(
        { code: "FORBIDDEN", message: "Sending a plate away is expo's call." },
        { status: 403 },
      );
    }
    if (msg.includes("NOT_FOUND")) {
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ code: "ERROR", message: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
