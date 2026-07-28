import { cookies } from "next/headers";
import { CartView } from "@/components/guest/CartView";
import { getMenuWithRunway } from "@/lib/data/menu";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const [menu, supabase, cookieStore] = await Promise.all([
    getMenuWithRunway(),
    createSupabaseServerClient(),
    cookies(),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The QR entry route (/t/[label]) sets this, so subsequent URLs stay clean.
  const tableLabel = cookieStore.get("brigade_table")?.value ?? null;
  let tableId: string | null = null;
  if (tableLabel) {
    const { data } = await supabase
      .from("tables")
      .select("id")
      .eq("restaurant_id", menu.restaurantId)
      .eq("label", tableLabel)
      .maybeSingle();
    tableId = data?.id ?? null;
  }

  const portionsByDish = Object.fromEntries(
    menu.dishes.map((d) => [d.id, d.runway.unlimited ? 999 : d.runway.portions]),
  );

  return (
    <CartView
      restaurantId={menu.restaurantId}
      tableId={tableId}
      tableLabel={tableLabel}
      portionsByDish={portionsByDish}
      // No email-verification gate: patch 008 removed it from place_order(), so the UI
      // must not reintroduce one. Signing in is still required, and that IS enforced in
      // the database rather than here.
      signedIn={Boolean(user)}
    />
  );
}
