import Link from "next/link";
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

/**
 * What each sortable column sorts by.
 *
 * Keyed off the row rather than the rendered text, so "12 kg" sorts as 12 and not
 * between "1" and "2" — the classic reason a sortable table gets distrusted and then
 * ignored.
 */
type PantryRow = Awaited<ReturnType<typeof getPantry>>["rows"][number];

const SORTS: Record<string, (r: PantryRow) => number | string> = {
  name: (r) => r.name.toLowerCase(),
  stock: (r) => r.stockQty,
  par: (r) => r.parLevel,
  reorder: (r) => r.suggestion.reorderPoint,
  usage: (r) => r.dailyUsageQty,
  supplier: (r) => (r.supplierName ?? "").toLowerCase(),
  lead: (r) => r.leadTimeDays,
  cost: (r) => r.costPerUnitCents ?? -1,
  // "Show me what to order" is the whole reason to open this screen.
  action: (r) => (r.suggestion.needsOrder ? 0 : 1),
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; only?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!isStaff(profile?.role)) return <StaffOnly what="the pantry" />;

  const [pantry, params] = await Promise.all([getPantry(), searchParams]);

  const sortKey = params.sort && SORTS[params.sort] ? params.sort : null;
  const dir = params.dir === "asc" ? "asc" : "desc";
  const onlyShort = params.only === "short";

  const expiring = pantry.rows.filter(
    (r) => r.shelfLifeDays !== null && r.shelfLifeDays <= 3,
  ).length;

  let rows = onlyShort
    ? pantry.rows.filter((r) => r.suggestion.needsOrder)
    : pantry.rows;

  if (sortKey) {
    const read = SORTS[sortKey]!;
    rows = [...rows].sort((a, b) => {
      const av = read(a);
      const bv = read(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
  }

  /** Tapping the active column flips the direction; a new column starts descending. */
  const hrefFor = (key: string) => {
    const next = new URLSearchParams();
    next.set("sort", key);
    next.set("dir", sortKey === key && dir === "desc" ? "asc" : "desc");
    if (onlyShort) next.set("only", "short");
    return `/ops/inventory?${next.toString()}`;
  };

  const filterHref = () => {
    const next = new URLSearchParams();
    if (sortKey) {
      next.set("sort", sortKey);
      next.set("dir", dir);
    }
    if (!onlyShort) next.set("only", "short");
    const qs = next.toString();
    return qs ? `/ops/inventory?${qs}` : "/ops/inventory";
  };

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

      {/* The header already counted how many need ordering and offered no way to act on
          it. A link rather than a control: it survives a reload and can be pinned open
          on a wall screen during a delivery. */}
      <p style={{ marginBottom: "var(--space-4)" }}>
        <Link
          href={filterHref() as never}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: "44px",
            padding: "0 var(--space-4)",
            borderRadius: "999px",
            border: `1px solid ${onlyShort ? "var(--color-accent)" : "var(--color-border-strong)"}`,
            background: onlyShort ? "var(--color-accent)" : "transparent",
            color: onlyShort ? "var(--color-accent-fg)" : "var(--color-fg-muted)",
            textDecoration: "none",
            fontSize: "var(--text-step--1)",
          }}
        >
          {onlyShort
            ? `✓ Needs ordering only (${rows.length})`
            : `Needs ordering only (${pantry.needsOrder})`}
        </Link>
      </p>

      {pantry.rows.length === 0 ? (
        <Empty>No ingredients tracked yet.</Empty>
      ) : rows.length === 0 ? (
        <Empty>Nothing needs ordering. The pantry is above its reorder points.</Empty>
      ) : (
        <Table
          sort={{ key: sortKey, dir, hrefFor }}
          head={[
            { label: "Ingredient", sortKey: "name" },
            { label: "#In stock", sortKey: "stock" },
            { label: "#Par", sortKey: "par" },
            { label: "#Reorder at", sortKey: "reorder" },
            { label: "#Used/day", sortKey: "usage" },
            { label: "Supplier", sortKey: "supplier" },
            { label: "#Lead", sortKey: "lead" },
            ...(pantry.showCost ? [{ label: "#Unit cost", sortKey: "cost" }] : []),
            { label: "Action", sortKey: "action" },
          ]}
        >
          {rows.map((r) => {
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
