import Link from "next/link";
import { notFound } from "next/navigation";
import { BillView, type BillLine } from "@/components/guest/BillView";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ItemStatus } from "@/lib/ops/tickets";

/*
 * The bill.
 *
 * RLS restricts the read to the order's owner (or same-restaurant staff), so another
 * guest's order id simply returns nothing — enforced in the database, not by a check
 * here.
 */

export const dynamic = "force-dynamic";

const one = <T,>(rel: T | T[] | null | undefined): T | null =>
  rel == null ? null : Array.isArray(rel) ? (rel[0] ?? null) : rel;

export default async function BillPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: order }, { data: restaurant }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, status, total_cents,
         tables ( label ),
         order_items ( id, qty, unit_price_cents, status, dishes ( name ) ),
         payments ( id, status )`,
      )
      .eq("id", orderId)
      .maybeSingle(),
    supabase.from("restaurants").select("tax_rate").limit(1).single(),
  ]);

  if (!order) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // "Not yours" and "not signed in" need different fixes, so they read differently.
    if (!user) {
      return (
        <section style={{ padding: "var(--space-6) var(--space-4)", maxWidth: "30rem" }}>
          <h1 style={{ fontSize: "var(--text-step-2)" }}>Sign in to see this bill</h1>
          <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
            Bills are private to the person who placed the order.
          </p>
          <Link
            href={`/auth/sign-in?returnTo=/bill/${orderId}` as never}
            style={{ color: "var(--color-accent)" }}
          >
            Sign in →
          </Link>
        </section>
      );
    }
    notFound();
  }

  const lines: BillLine[] = (order.order_items ?? []).map((it) => ({
    id: it.id as string,
    dishName: one<{ name: string }>(it.dishes)?.name ?? "—",
    qty: it.qty as number,
    unitPriceCents: it.unit_price_cents as number,
    status: it.status as ItemStatus,
  }));

  const settled =
    order.status === "paid" ||
    ((order.payments ?? []) as { status: string }[]).some((p) => p.status === "succeeded");

  return (
    <BillView
      orderId={order.id as string}
      tableLabel={one<{ label: string }>(order.tables)?.label ?? null}
      lines={lines}
      taxRate={Number(restaurant?.tax_rate ?? 0.08)}
      alreadyPaid={settled}
      paidTotalCents={(order.total_cents as number) ?? 0}
    />
  );
}
