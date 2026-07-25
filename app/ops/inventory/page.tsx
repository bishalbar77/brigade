import { LiveFrame } from "@/components/ops/LiveFrame";
import { Cell, Empty, OpsHeader, Pill, ScopeNote, StaffOnly, Table } from "@/components/ops/ReadOnly";
import { getPantry } from "@/lib/data/reports";
import { formatCents } from "@/lib/money";
import { getCurrentProfile } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth/roles";

/*
 * The pantry. Read-only by design; stock changes happen on the runway board, because
 * you top up at the moment something tells you there's a shortage.
 *
 * Reorder quantities come from the same consumption model the runway uses, and are
 * capped by shelf life — a naive reorder system generates exactly the waste it was
 * bought to prevent.
 */

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const profile = await getCurrentProfile();
  if (!isStaff(profile?.role)) return <StaffOnly what="the pantry" />;

  const pantry = await getPantry();

  const expiring = pantry.rows.filter(
    (r) => r.shelfLifeDays !== null && r.shelfLifeDays <= 3,
  ).length;

  return (
    <LiveFrame channel="pantry" tables={["ingredients"]}>
      <OpsHeader
        title="Pantry"
        subtitle="Stock against par, with reorder quantities worked out from how fast each ingredient is actually being used — then capped by shelf life, so nothing is ordered that would spoil first."
        stats={[
          {
            label: "need ordering",
            value: String(pantry.needsOrder),
            tone: pantry.needsOrder > 0 ? "warn" : "normal",
          },
          { label: "short shelf life", value: String(expiring) },
          { label: "tracked", value: String(pantry.rows.length) },
        ]}
      />

      <ScopeNote action={{ href: "/ops/runway", label: "Runway board" }}>
        This view is read-only. Deliveries, waste and stock counts are recorded where the
        shortage is noticed —
      </ScopeNote>

      {!pantry.showCost && (
        <ScopeNote>
          Unit costs are hidden for your role. Ask a manager or owner if you need them.
        </ScopeNote>
      )}

      {pantry.rows.length === 0 ? (
        <Empty>No ingredients tracked yet.</Empty>
      ) : (
        <Table
          head={[
            "Ingredient",
            "#In stock",
            "#Par",
            "#Reorder at",
            "#Used/day",
            "Supplier",
            "#Lead",
            ...(pantry.showCost ? ["#Unit cost"] : []),
            "Action",
          ]}
        >
          {pantry.rows.map((r) => {
            const short = r.suggestion.needsOrder;
            return (
              <tr key={r.id}>
                <Cell strong>{r.name}</Cell>
                <Cell numeric tone={short ? "critical" : undefined}>
                  {r.stockQty} {r.unit}
                </Cell>
                <Cell numeric tone="muted">
                  {r.parLevel}
                </Cell>
                <Cell numeric tone="muted">
                  {Math.round(r.suggestion.reorderPoint * 100) / 100}
                </Cell>
                <Cell numeric tone="muted">
                  {r.dailyUsageQty > 0 ? Math.round(r.dailyUsageQty * 100) / 100 : "—"}
                </Cell>
                <Cell tone="muted">{r.supplierName ?? "—"}</Cell>
                <Cell numeric tone="muted">
                  {r.leadTimeDays}d
                </Cell>
                {pantry.showCost && (
                  <Cell numeric tone="muted">
                    {r.costPerUnitCents !== null ? formatCents(r.costPerUnitCents) : "—"}
                  </Cell>
                )}
                <Cell>
                  {short ? (
                    <Pill tone="warn">
                      order {r.suggestion.suggestedQty} {r.unit}
                      {r.suggestion.cappedByShelfLife ? " · shelf-life capped" : ""}
                    </Pill>
                  ) : (
                    <Pill tone="ok">ok</Pill>
                  )}
                </Cell>
              </tr>
            );
          })}
        </Table>
      )}

      <p
        style={{
          marginTop: "var(--space-4)",
          color: "var(--color-fg-subtle)",
          fontSize: "var(--text-step--1)",
          maxWidth: "70ch",
        }}
      >
        Reorder point = daily usage × supplier lead time × 1.2 safety factor. &ldquo;Used/day&rdquo;
        is summed across every dish containing the ingredient, from each dish&rsquo;s current sell
        rate — so it moves with the menu rather than being typed in.
      </p>
    </LiveFrame>
  );
}
