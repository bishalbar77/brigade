import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Settle a bill.
 *
 * Delegates to `pay_order()`, which prices from what was actually SERVED at the price
 * captured on each line, refuses while anything is still with the kitchen, and is
 * idempotent — an already-paid order returns its existing payment rather than charging
 * twice. Totals are never accepted from the client: a client-submitted total is a
 * client-controlled price.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { method?: string; tipCents?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tipCents = Number.isFinite(body.tipCents) ? Math.max(0, Math.round(body.tipCents!)) : 0;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pay_order", {
    p_order_id: id,
    p_method: body.method ?? "card",
    p_tip_cents: tipCents,
  });

  if (error) {
    const raw = `${error.message ?? ""} ${(error as { details?: string }).details ?? ""}`;
    if (raw.includes("ITEMS_NOT_SERVED")) {
      return NextResponse.json(
        {
          code: "ITEMS_NOT_SERVED",
          message: "The kitchen is still working on part of this order.",
        },
        { status: 409 },
      );
    }
    if (raw.includes("FORBIDDEN")) {
      return NextResponse.json({ code: "FORBIDDEN", message: "That isn't your bill." }, { status: 403 });
    }
    if (raw.includes("NOT_AUTHENTICATED")) {
      return NextResponse.json({ code: "NOT_AUTHENTICATED", message: "Sign in first." }, { status: 401 });
    }
    return NextResponse.json({ code: "ERROR", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ paymentId: data }, { status: 201 });
}
