import { Cell, Empty, OpsHeader, Pill, ScopeNote, StaffOnly, Table } from "@/components/ops/ReadOnly";
import { STATION_LABEL } from "@/lib/ops/tickets";
import { getMenuAdmin } from "@/lib/data/reports";
import { formatCents } from "@/lib/money";
import { getCurrentProfile } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth/roles";

/*
 * Menu and recipes — the bill of materials, read-only.
 *
 * This is the screen that EXPLAINS the product. Availability isn't a number someone
 * types in: this dish needs 1 sea bass fillet and 0.5 lemon, there are 4 fillets, so
 * there are 4 portions and the fillet is what binds it. Showing the arithmetic is the
 * clearest fifteen seconds available for explaining the whole thing.
 *
 * The editing form is cut (see the UI spec); recipes are configurable by SQL.
 */

export const dynamic = "force-dynamic";

export default async function MenuAdminPage() {
  const profile = await getCurrentProfile();
  if (!isStaff(profile?.role)) return <StaffOnly what="menu costing" />;

  const { rows, showCost } = await getMenuAdmin();

  const tracked = rows.filter((r) => !r.unlimited).length;

  return (
    <div className="ops-measure">
      <OpsHeader
        title="Menu & recipes"
        subtitle="Every dish, what it's made of, and how many portions that allows. Nothing here is stored as an availability figure — it's counted from stock each time it's asked for."
        stats={[
          { label: "dishes", value: String(rows.length) },
          { label: "with a recipe", value: `${tracked}/${rows.length}` },
        ]}
      />

      <ScopeNote action={{ href: "/ops/runway", label: "Runway board" }}>
        This view is read-only — recipe editing is out of scope for this build. Stock changes
        are made where the shortage shows up —
      </ScopeNote>

      {rows.length === 0 ? (
        <Empty>No dishes on the menu yet.</Empty>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          {rows.map((dish) => (
            <article
              key={dish.id}
              style={{
                border: "1px solid var(--color-border-strong)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-raised)",
                padding: "var(--space-4)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--space-4)",
                  flexWrap: "wrap",
                  marginBottom: "var(--space-3)",
                }}
              >
                <h2
                  style={{
                    fontSize: "var(--text-step-1)",
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                  }}
                >
                  {dish.name}
                </h2>
                <p className="eyebrow">{STATION_LABEL[dish.station]}</p>
                <p className="mono" style={{ marginLeft: "auto" }}>
                  {formatCents(dish.priceCents)}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "var(--space-5)",
                  flexWrap: "wrap",
                  marginBottom: "var(--space-3)",
                }}
              >
                <Figure
                  label="portions now"
                  value={dish.unlimited ? "no limit" : String(dish.portions)}
                  tone={!dish.unlimited && dish.portions <= 3 ? "critical" : "normal"}
                />
                {showCost && dish.foodCostCents !== null && (
                  <>
                    <Figure label="food cost" value={formatCents(dish.foodCostCents)} />
                    <Figure
                      label="margin"
                      value={`${formatCents(dish.marginCents ?? 0)} · ${Math.round(dish.marginPct ?? 0)}%`}
                      tone={(dish.marginPct ?? 0) < 60 ? "warn" : "normal"}
                    />
                  </>
                )}
                {dish.bindingIngredient && (
                  <Figure label="binds on" value={dish.bindingIngredient} />
                )}
              </div>

              {dish.bom.length === 0 ? (
                <p style={{ color: "var(--color-fg-muted)", fontSize: "var(--text-step--1)" }}>
                  No recipe entered, so this dish isn&rsquo;t stock-tracked — it shows as available
                  rather than as unavailable. An unconfigured dish is not a scarce one.
                </p>
              ) : (
                <Table
                  head={[
                    "Ingredient",
                    "#Per portion",
                    "#In stock",
                    "#Allows",
                    ...(showCost ? ["#Line cost"] : []),
                  ]}
                >
                  {dish.bom.map((line, i) => (
                    <tr key={line.ingredientName}>
                      <Cell strong={i === 0}>
                        {line.ingredientName}
                        {i === 0 && (
                          <>
                            {" "}
                            <Pill tone="warn">binds</Pill>
                          </>
                        )}
                      </Cell>
                      <Cell numeric tone="muted">
                        {line.qty} {line.unit}
                      </Cell>
                      <Cell numeric tone="muted">
                        {line.stockQty} {line.unit}
                      </Cell>
                      <Cell numeric tone={i === 0 ? "warn" : "muted"} strong={i === 0}>
                        {line.portionsFromThis}
                      </Cell>
                      {showCost && (
                        <Cell numeric tone="muted">
                          {line.lineCostCents !== null ? formatCents(line.lineCostCents) : "—"}
                        </Cell>
                      )}
                    </tr>
                  ))}
                </Table>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "warn" | "critical";
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p
        className="mono"
        style={{
          fontSize: "var(--text-step-0)",
          fontWeight: 600,
          color:
            tone === "critical"
              ? "var(--color-runway-critical)"
              : tone === "warn"
                ? "var(--color-runway-low)"
                : "var(--color-fg)",
        }}
      >
        {value}
      </p>
    </div>
  );
}
