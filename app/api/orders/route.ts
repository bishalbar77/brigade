import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Place an order.
 *
 * Calls `place_order()` and does NOT check availability first. That is deliberate:
 * a read-then-write here is precisely the race the function exists to close. Two
 * guests both seeing "1 left" and tapping at the same moment must not both succeed,
 * and only a transaction holding row locks can decide that.
 *
 * Errors are typed so the cart can offer a recovery rather than an apology.
 */

interface IncomingItem {
  dishId?: string;
  qty?: number;
  notes?: string;
}

export async function POST(request: Request) {
  let body: {
    restaurantId?: string;
    tableId?: string | null;
    items?: IncomingItem[];
    idempotencyKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }

  const { restaurantId, tableId, items, idempotencyKey } = body;

  if (!restaurantId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { code: "EMPTY_ORDER", message: "There's nothing in this order." },
      { status: 400 },
    );
  }

  const clean = items
    .filter((i): i is { dishId: string; qty: number; notes?: string } =>
      Boolean(i.dishId) && Number.isInteger(i.qty) && (i.qty as number) > 0,
    )
    .map((i) => ({ dish_id: i.dishId, qty: i.qty, notes: i.notes ?? null }));

  if (clean.length === 0) {
    return NextResponse.json(
      { code: "EMPTY_ORDER", message: "There's nothing in this order." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("place_order", {
    p_restaurant_id: restaurantId,
    p_table_id: tableId ?? null,
    p_items: clean,
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error) {
    const raw = `${error.message ?? ""} ${(error as { details?: string }).details ?? ""}`;

    if (raw.includes("INSUFFICIENT_STOCK")) {
      // The function packs `dish|portions` into DETAIL. Parse from the RIGHT of the
      // last pipe, so a dish whose name contains "|" still yields the right number.
      const detail = (error as { details?: string }).details ?? "";
      const sep = detail.lastIndexOf("|");
      const dish = sep > 0 ? detail.slice(0, sep) : "That dish";
      const available = sep > 0 ? Number.parseInt(detail.slice(sep + 1), 10) : 0;

      return NextResponse.json(
        {
          code: "INSUFFICIENT_STOCK",
          dish,
          available: Number.isFinite(available) ? available : 0,
          message:
            available > 0
              ? `Only ${available} ${dish} left.`
              : `The last ${dish} just went.`,
        },
        { status: 409 },
      );
    }

    if (raw.includes("EMAIL_NOT_VERIFIED")) {
      return NextResponse.json(
        {
          code: "EMAIL_NOT_VERIFIED",
          message: "Verify your email address before ordering.",
        },
        { status: 403 },
      );
    }

    if (raw.includes("NOT_AUTHENTICATED")) {
      return NextResponse.json(
        { code: "NOT_AUTHENTICATED", message: "Sign in to place an order." },
        { status: 401 },
      );
    }

    return NextResponse.json({ code: "ERROR", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ orderId: data }, { status: 201 });
}
