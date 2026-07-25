import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackingRail, type TrackedItem } from "@/components/guest/TrackingRail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ItemStatus } from "@/lib/ops/tickets";

/*
 * Guest order tracking.
 *
 * RLS restricts this to the order's owner (or same-restaurant staff), so changing
 * the id in the URL returns nothing — enforced in the database, not by a check here.
 * A not-found is therefore the correct response to someone else's order.
 */

export const dynamic = "force-dynamic";

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, total_cents, status,
       tables ( label ),
       order_items ( id, qty, unit_price_cents, status, dishes ( name, prep_minutes ) )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Distinguish "not yours / gone" from "not signed in", because the fix differs.
    if (!user) {
      return (
        <section style={{ padding: "var(--space-6) var(--space-4)", maxWidth: "30rem" }}>
          <h1 style={{ fontSize: "var(--text-step-2)" }}>Sign in to see this order</h1>
          <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
            Orders are private to the person who placed them.
          </p>
          <Link
            href={`/auth/sign-in?returnTo=/order/${id}` as never}
            style={{ color: "var(--color-accent)" }}
          >
            Sign in →
          </Link>
        </section>
      );
    }
    notFound();
  }

  const items: TrackedItem[] = (order.order_items ?? []).map((it) => {
    const dish = one<{ name: string; prep_minutes: number }>(it.dishes);
    return {
      id: it.id as string,
      dishName: dish?.name ?? "—",
      qty: it.qty as number,
      unitPriceCents: it.unit_price_cents as number,
      status: it.status as ItemStatus,
      prepMinutes: dish?.prep_minutes ?? 10,
    };
  });

  const live = items.filter((i) => i.status !== "voided");
  const allServed = live.length > 0 && live.every((i) => i.status === "served");

  return (
    <TrackingRail
      orderId={order.id as string}
      tableLabel={one<{ label: string }>(order.tables)?.label ?? null}
      items={items}
      allServed={allServed}
      totalCents={order.total_cents as number}
    />
  );
}
