import { resolveTimeZone } from "@/lib/runway/clock";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ItemStatus } from "@/lib/ops/tickets";

/**
 * A diner's own past orders.
 *
 * WHY THIS EXISTS
 * `/order/[id]` was a true orphan: nothing in the app linked to it. The only way in was
 * the `router.replace` that runs the instant an order is placed — and `CartView` calls
 * `clearCart()` on the same line, so the id survived nowhere but the address bar. Close
 * the tab and a diner could no longer reach their own order or their own bill, while the
 * kitchen could still see both. That is not a missing feature so much as a missing half
 * of the ordering flow.
 *
 * Everything here rides on `orders_read_own` — `guest_id = (select auth.uid())` — so
 * there is no ownership check in this file and there must not be one. The database
 * already decides, and a second filter in TypeScript would be a second thing to keep in
 * agreement with the first. See ADR-3.
 *
 * `tables ( label )` is deliberately NOT selected. `tables_read` requires `is_staff()`,
 * so for a diner the embedded relation comes back empty and the label is always null —
 * asking for it would look like a bug the first time someone read the query.
 */

export interface OrderHistoryLine {
  dishName: string;
  qty: number;
  status: ItemStatus;
}

export interface OrderHistoryEntry {
  id: string;
  /** ISO, in UTC. Formatted for display in the restaurant's zone by the caller. */
  openedAt: string;
  closedAt: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  lines: OrderHistoryLine[];
  /** True once every non-voided line has been served — the bill is settleable. */
  allServed: boolean;
  /** True when a payment succeeded, so the row offers a receipt rather than a bill. */
  paid: boolean;
  itemCount: number;
}

export interface OrderHistoryPayload {
  orders: OrderHistoryEntry[];
  timeZone: string;
  signedIn: boolean;
}

/** PostgREST types an embedded relation as object-or-array. Same helper as the pages. */
const one = <T,>(rel: T | T[] | null | undefined): T | null =>
  rel == null ? null : Array.isArray(rel) ? (rel[0] ?? null) : rel;

/**
 * Every order this diner has placed, newest first.
 *
 * Returns `signedIn: false` rather than throwing when there is no session, because
 * "you are not signed in" is a screen with a sign-in button on it, not an error.
 */
export async function getOrderHistory(limit = 25): Promise<OrderHistoryPayload> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The restaurant is read for its timezone only — the same `.limit(1).single()` as
  // every other reader, and the only place a slug would go in a multi-tenant build.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("timezone")
    .limit(1)
    .single();

  const timeZone = resolveTimeZone(restaurant?.timezone as string | null);

  if (!user) return { orders: [], timeZone, signedIn: false };

  /*
   * One query, with items and payments embedded.
   *
   * `payments ( status )` is here rather than derived from `orders.status` because the
   * two can disagree in one direction that matters: `pay_order()` returns an existing
   * succeeded payment early when called twice, and a row could in principle carry a
   * payment while the status update is what failed. Reading both and OR-ing them means a
   * paid order never offers to charge again.
   *
   * No `.eq("guest_id", …)`: orders_read_own already restricts this to the caller. The
   * filter would be redundant today and misleading tomorrow — it would imply the RLS
   * policy were not the thing doing the work.
   */
  const { data: rows, error } = await supabase
    .from("orders")
    .select(
      `id, status, opened_at, closed_at,
       subtotal_cents, tax_cents, tip_cents, total_cents,
       order_items ( id, qty, status, dishes ( name ) ),
       payments ( status )`,
    )
    .order("opened_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`orders: ${error.message}`);

  const orders: OrderHistoryEntry[] = (rows ?? []).map((o) => {
    const items = (o.order_items ?? []) as {
      id: string;
      qty: number;
      status: ItemStatus;
      dishes: { name: string } | { name: string }[] | null;
    }[];
    const payments = (o.payments ?? []) as { status: string }[];

    const lines: OrderHistoryLine[] = items.map((i) => ({
      dishName: one<{ name: string }>(i.dishes)?.name ?? "—",
      qty: i.qty,
      status: i.status,
    }));

    // Voided lines are excluded from both, exactly as the tracking and bill screens do:
    // an order whose only item was cancelled is not "fully served".
    const live = lines.filter((l) => l.status !== "voided");

    return {
      id: o.id as string,
      openedAt: o.opened_at as string,
      closedAt: (o.closed_at as string | null) ?? null,
      status: o.status as string,
      subtotalCents: (o.subtotal_cents as number) ?? 0,
      taxCents: (o.tax_cents as number) ?? 0,
      tipCents: (o.tip_cents as number) ?? 0,
      totalCents: (o.total_cents as number) ?? 0,
      lines,
      allServed: live.length > 0 && live.every((l) => l.status === "served"),
      paid: o.status === "paid" || payments.some((p) => p.status === "succeeded"),
      itemCount: live.reduce((n, l) => n + l.qty, 0),
    };
  });

  return { orders, timeZone, signedIn: true };
}
