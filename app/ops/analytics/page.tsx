import { MenuMatrix, type MatrixDish } from "@/components/ops/MenuMatrix";
import { Empty, OpsHeader, ScopeNote, StaffOnly } from "@/components/ops/ReadOnly";
import { getAnalytics } from "@/lib/data/reports";
import { formatCents } from "@/lib/money";
import { getCurrentProfile } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth/roles";

/*
 * Service analytics.
 *
 * Deliberately NOT realtime. A matrix that reshuffles while you are reading it is
 * worse, not better — this is a considered read at the end of service, not a monitor.
 *
 * The summary is stat tiles rather than charts: five single numbers are five numbers,
 * and a one-bar bar chart is an anti-pattern. The one real chart earns its place
 * because position genuinely carries the meaning.
 */

export const dynamic = "force-dynamic";

const FOOD_COST_BAND = { low: 28, high: 32 };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!isStaff(profile?.role)) return <StaffOnly what="service numbers" />;

  const [{ summary, performance, windowDays, showCost, enoughData }, params] =
    await Promise.all([getAnalytics(), searchParams]);

  // The page owns the URL; MenuMatrix owns the comparators. `#matrix` so a sort does
  // not throw the reader back to the top of a long page.
  const matrixSort = params.sort ?? null;
  const matrixDir = params.dir === "asc" ? "asc" : "desc";
  const matrixHref = (key: string) =>
    `/ops/analytics?sort=${key}&dir=${
      matrixSort === key && matrixDir === "desc" ? "asc" : "desc"
    }#matrix`;

  const foodCost = summary.foodCostPct;
  const foodCostTone =
    foodCost === null
      ? "normal"
      : foodCost > FOOD_COST_BAND.high
        ? "critical"
        : foodCost < FOOD_COST_BAND.low
          ? "normal"
          : "warn";

  const matrix: MatrixDish[] = performance
    .filter((p) => p.unitsSold > 0)
    .map((p) => ({
      dishId: p.dishId,
      name: p.name,
      unitsSold: p.unitsSold,
      popularity: p.popularity,
      marginCents: p.marginCents,
      foodCostCents: p.foodCostCents,
      priceCents: p.priceCents,
      menuClass: p.menuClass,
    }));

  return (
    <div>
      <OpsHeader
        title="Service"
        subtitle={`The last ${windowDays} days of trading. Everything here is computed from the order ledger — no figure is typed in.`}
        stats={[
          // Each label names exactly what the number is. "covers" implied a guest count
          // and the figure is seats at the tables used; "revenue" implied takings and the
          // figure now excludes tax and tips so it stays one thing all evening. A tile
          // whose label overstates its number is the kind of error nobody catches on
          // stage and nobody forgives afterwards.
          { label: "seats turned", value: String(summary.covers) },
          { label: "net revenue", value: formatCents(summary.revenueCents) },
          { label: "per seat", value: formatCents(summary.perCoverCents) },
          {
            label: "median turn",
            value: summary.avgTurnMinutes !== null ? `${summary.avgTurnMinutes}m` : "—",
          },
          ...(foodCost !== null
            ? [
                {
                  label: "food cost",
                  value: `${foodCost.toFixed(1)}%`,
                  tone: foodCostTone as "normal" | "warn" | "critical",
                },
              ]
            : []),
        ]}
      />

      {foodCost !== null && (
        <p
          style={{
            marginBottom: "var(--space-5)",
            color: "var(--color-fg-muted)",
            fontSize: "var(--text-step--1)",
          }}
        >
          Food cost against the {FOOD_COST_BAND.low}–{FOOD_COST_BAND.high}% the industry typically
          runs at:{" "}
          <strong style={{ color: `var(--color-runway-${foodCostTone === "critical" ? "critical" : foodCostTone === "warn" ? "low" : "plenty"})` }}>
            {foodCost > FOOD_COST_BAND.high
              ? "above the band — plate costs are eating the margin"
              : foodCost < FOOD_COST_BAND.low
                ? "below the band — healthy"
                : "inside the band"}
          </strong>
          .
        </p>
      )}

      {!showCost && (
        <ScopeNote>
          Margin and food cost are hidden for your role, so the menu matrix isn&rsquo;t shown. A
          manager or owner sees the full picture.
        </ScopeNote>
      )}

      {!enoughData ? (
        /* Honest degradation. A matrix drawn from a handful of orders is decoration
           dressed as analysis, so it is not drawn at all. */
        <Empty>
          Not enough trading history yet — {summary.orders} paid orders in the last {windowDays}{" "}
          days, and at least 30 are needed before a menu matrix says anything real. The figures
          above are still accurate.
        </Empty>
      ) : !showCost || matrix.length === 0 ? null : (
        <section id="matrix">
          <h2 style={{ fontSize: "var(--text-step-1)", marginBottom: "var(--space-2)" }}>
            Which dishes earn their place
          </h2>
          <p
            style={{
              color: "var(--color-fg-muted)",
              marginBottom: "var(--space-4)",
              maxWidth: "72ch",
            }}
          >
            How often each dish is ordered, against what it actually earns after ingredient cost.
            The four quadrants are the standard Kasavana&ndash;Smith reading, and each one implies a
            different action.
          </p>
          <MenuMatrix
            dishes={matrix}
            sortKey={matrixSort}
            dir={matrixDir}
            hrefFor={matrixHref}
          />
        </section>
      )}
    </div>
  );
}
