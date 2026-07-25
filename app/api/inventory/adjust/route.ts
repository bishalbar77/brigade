import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Adjust ingredient stock.
 *
 * Delegates to `adjust_stock()`, which is one of only two sanctioned ways stock
 * ever changes (the other is `place_order()`). It writes an append-only ledger row
 * with a reason and an actor, then updates the projection — so the ledger and
 * `stock_qty` cannot drift, and `manager`/`owner` is enforced inside the function
 * rather than by whether this route happened to check.
 *
 * There is deliberately no path here that writes `ingredients.stock_qty` directly.
 */

const REASONS = new Set(["purchase", "waste", "correction", "count"]);

export async function POST(request: Request) {
  let body: { ingredientId?: string; delta?: number; reason?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }

  const { ingredientId, delta, reason, note } = body;

  if (!ingredientId || typeof delta !== "number" || !Number.isFinite(delta)) {
    return NextResponse.json(
      { code: "BAD_REQUEST", message: "ingredientId and a numeric delta are required." },
      { status: 400 },
    );
  }
  if (delta === 0) {
    return NextResponse.json(
      { code: "BAD_REQUEST", message: "A zero adjustment records nothing." },
      { status: 400 },
    );
  }
  if (!reason || !REASONS.has(reason)) {
    return NextResponse.json(
      { code: "BAD_REQUEST", message: `reason must be one of: ${[...REASONS].join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_ingredient_id: ingredientId,
    p_delta: delta,
    p_reason: reason,
    p_note: note ?? null,
  });

  if (error) {
    if ((error.message ?? "").includes("FORBIDDEN")) {
      return NextResponse.json(
        { code: "FORBIDDEN", message: "Changing stock is a manager's call." },
        { status: 403 },
      );
    }
    return NextResponse.json({ code: "ERROR", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stockQty: data });
}
