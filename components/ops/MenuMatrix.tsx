import { Cell, Pill, Table } from "@/components/ops/ReadOnly";
import { formatCents } from "@/lib/money";
import type { MenuClass } from "@/lib/runway/types";

/*
 * Kasavana–Smith menu engineering matrix.
 *
 * Popularity (share of units sold) against contribution margin, quadranted on the
 * MEDIAN of each axis. Medians rather than means so one outlier dish can't move the
 * boundaries.
 *
 * DESIGN DECISIONS, each made against the dataviz anti-pattern catalog:
 *
 * - ONE hue for every dot. The quadrant is already encoded by POSITION relative to
 *   the median crosshair, and colouring it too would burn the only free channel on
 *   information the chart already shows. Using the status scale for it would be worse
 *   still — status colours mean good/bad state, not series identity.
 * - Quadrant names AND their action are set in text inside each region, so the
 *   classification is never colour-dependent.
 * - Direct labels are SELECTIVE — the two most popular, the highest margin, and every
 *   Dog. A label on all twenty points is chaos and goes unread; the table carries the
 *   rest.
 * - The median lines are DASHED deliberately. Dashing is wrong for a grid but right
 *   for a threshold, and a median boundary is exactly a threshold.
 * - Hit targets are 22px radius, not the 6px dot. A scatter you must land on
 *   dead-centre is unusable.
 * - Native <title> plus a full table twin: the tooltip enhances, it never gates. Every
 *   value is readable without hovering, and the dots are keyboard-focusable.
 *
 * Rendered as pure SVG in a server component — no client JS, no chart library, and
 * total control over hit areas and tokens.
 */

export interface MatrixDish {
  dishId: string;
  name: string;
  unitsSold: number;
  popularity: number;
  marginCents: number;
  foodCostCents: number;
  priceCents: number;
  menuClass: MenuClass;
}

const CLASS_LABEL: Record<MenuClass, string> = {
  star: "Star",
  plowhorse: "Plowhorse",
  puzzle: "Puzzle",
  dog: "Dog",
};

const CLASS_ACTION: Record<MenuClass, string> = {
  star: "Protect it. Keep the recipe and the price exactly as they are.",
  plowhorse: "Sells well, earns little. Reprice, or re-engineer the plate cost.",
  puzzle: "Earns well, rarely ordered. Move it up the menu and have staff mention it.",
  dog: "Neither popular nor profitable. Consider cutting it.",
};

const CLASS_TONE: Record<MenuClass, "ok" | "warn" | "info" | "critical"> = {
  star: "ok",
  plowhorse: "warn",
  puzzle: "info",
  dog: "critical",
};

// Plot geometry. The container includes the axis band, so nothing gets a nested
// scrollbar from a fixed height that excludes its own labels.
const W = 720;
const H = 420;
const PAD = { top: 28, right: 24, bottom: 52, left: 76 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * How each sortable column of the table twin reads its value.
 *
 * Sorted on the underlying number, not the rendered string: `formatCents` produces
 * "₹1,23,456", and sorting that lexically puts ₹99 above ₹1,000.
 */
const MATRIX_SORTS: Record<string, (d: MatrixDish) => number | string> = {
  dish: (d) => d.name.toLowerCase(),
  class: (d) => d.menuClass,
  sold: (d) => d.unitsSold,
  share: (d) => d.popularity,
  price: (d) => d.priceCents,
  cost: (d) => d.foodCostCents,
  margin: (d) => d.marginCents,
};

export function MenuMatrix({
  dishes,
  sortKey = null,
  dir = "desc",
  hrefFor,
}: {
  dishes: MatrixDish[];
  /** Null keeps the default: most popular first, which is how the matrix reads. */
  sortKey?: string | null;
  dir?: "asc" | "desc";
  /** Supplied by the page, which owns the URL. Omit and the headers stay inert. */
  hrefFor?: (key: string) => string;
}) {
  if (dishes.length === 0) return null;

  // The chart above always plots every dish; only the table twin below reorders. The
  // default stays most-popular-first, which is the reading order the matrix implies.
  const read = sortKey ? MATRIX_SORTS[sortKey] : undefined;
  const sortedDishes = read
    ? [...dishes].sort((a, b) => {
        const av = read(a);
        const bv = read(b);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return dir === "asc" ? cmp : -cmp;
      })
    : [...dishes].sort((a, b) => b.popularity - a.popularity);

  const pops = dishes.map((d) => d.popularity);
  const margins = dishes.map((d) => d.marginCents);

  const medPop = median(pops);
  const medMargin = median(margins);

  // Pad the domains so points never sit on the frame.
  const maxPop = Math.max(...pops) * 1.12 || 1;
  const minMargin = Math.min(0, Math.min(...margins) * 1.1);
  const maxMargin = Math.max(...margins) * 1.12 || 1;

  const x = (p: number) => PAD.left + (p / maxPop) * PLOT_W;
  const y = (m: number) =>
    PAD.top + PLOT_H - ((m - minMargin) / (maxMargin - minMargin)) * PLOT_H;

  const mx = x(medPop);
  const my = y(medMargin);

  // Selective direct labels: the two most ordered, the best margin, and every Dog.
  const byPop = [...dishes].sort((a, b) => b.popularity - a.popularity);
  const labelled = new Set<string>([
    ...byPop.slice(0, 2).map((d) => d.dishId),
    [...dishes].sort((a, b) => b.marginCents - a.marginCents)[0]!.dishId,
    ...dishes.filter((d) => d.menuClass === "dog").map((d) => d.dishId),
  ]);

  const counts = (["star", "plowhorse", "puzzle", "dog"] as MenuClass[]).map((c) => ({
    menuClass: c,
    n: dishes.filter((d) => d.menuClass === c).length,
  }));

  return (
    <div>
      {/* Wide content scrolls inside its own container; the body never scrolls. */}
      <div className="scroll-x">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ minWidth: "38rem", display: "block" }}
          role="img"
          aria-label={`Menu engineering matrix. ${dishes.length} dishes plotted by how often they are ordered against the margin each one earns, split on the median of both. ${counts
            .map((c) => `${c.n} ${CLASS_LABEL[c.menuClass]}`)
            .join(", ")}. The full figures are in the table below.`}
        >
          {/* Quadrant regions. Fills are barely-there so the dots carry the eye. */}
          <rect x={mx} y={PAD.top} width={PAD.left + PLOT_W - mx} height={my - PAD.top}
                fill="var(--color-ok)" opacity="0.07" />
          <rect x={PAD.left} y={PAD.top} width={mx - PAD.left} height={my - PAD.top}
                fill="var(--color-accent)" opacity="0.05" />
          <rect x={mx} y={my} width={PAD.left + PLOT_W - mx} height={PAD.top + PLOT_H - my}
                fill="var(--color-runway-low)" opacity="0.06" />
          <rect x={PAD.left} y={my} width={mx - PAD.left} height={PAD.top + PLOT_H - my}
                fill="var(--color-runway-critical)" opacity="0.06" />

          {/* Axis frame: solid hairlines, one shade off the surface. */}
          <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={PAD.left + PLOT_W} y2={PAD.top + PLOT_H}
                stroke="var(--color-border-strong)" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H}
                stroke="var(--color-border-strong)" strokeWidth="1" />

          {/* Median thresholds — dashed, because these ARE thresholds rather than grid. */}
          <line x1={mx} y1={PAD.top} x2={mx} y2={PAD.top + PLOT_H}
                stroke="var(--color-fg-subtle)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1={PAD.left} y1={my} x2={PAD.left + PLOT_W} y2={my}
                stroke="var(--color-fg-subtle)" strokeWidth="1" strokeDasharray="4 4" />

          {/* Quadrant names in TEXT, so classification never depends on colour. */}
          <QuadrantLabel x={mx + 10} y={PAD.top + 16} anchor="start" name="Star" hint="protect" />
          <QuadrantLabel x={mx - 10} y={PAD.top + 16} anchor="end" name="Puzzle" hint="promote" />
          <QuadrantLabel x={mx + 10} y={PAD.top + PLOT_H - 8} anchor="start" name="Plowhorse" hint="reprice" />
          <QuadrantLabel x={mx - 10} y={PAD.top + PLOT_H - 8} anchor="end" name="Dog" hint="cut" />

          {/* Axis titles */}
          <text x={PAD.left + PLOT_W / 2} y={H - 12} textAnchor="middle"
                fill="var(--color-fg-muted)" fontSize="13" fontFamily="var(--font-mono)">
            share of orders →
          </text>
          <text x={18} y={PAD.top + PLOT_H / 2} textAnchor="middle"
                transform={`rotate(-90 18 ${PAD.top + PLOT_H / 2})`}
                fill="var(--color-fg-muted)" fontSize="13" fontFamily="var(--font-mono)">
            margin per dish →
          </text>

          {/* Axis ticks: tabular here is correct — digits align vertically. */}
          {[0, medMargin, maxMargin].map((m, i) => (
            <text key={i} x={PAD.left - 10} y={y(m) + 4} textAnchor="end"
                  fill="var(--color-fg-subtle)" fontSize="12" fontFamily="var(--font-mono)"
                  style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCents(Math.round(m))}
            </text>
          ))}

          {dishes.map((d) => {
            const cx = x(d.popularity);
            const cy = y(d.marginCents);
            const isDog = d.menuClass === "dog";
            return (
              <g key={d.dishId}>
                {/* Generous invisible hit area — 22px, not the 6px dot. */}
                <circle cx={cx} cy={cy} r="22" fill="transparent" tabIndex={0}
                        style={{ cursor: "help" }}>
                  <title>
                    {`${d.name} — ${CLASS_LABEL[d.menuClass]}. ${d.unitsSold} sold (${(d.popularity * 100).toFixed(1)}% of orders), margin ${formatCents(d.marginCents)} on a ${formatCents(d.priceCents)} price. ${CLASS_ACTION[d.menuClass]}`}
                  </title>
                </circle>
                {/* 2px surface ring so overlapping dots stay countable. */}
                <circle cx={cx} cy={cy} r="7" fill="var(--color-bg)" opacity="0.9" />
                <circle
                  cx={cx}
                  cy={cy}
                  r="5.5"
                  fill={isDog ? "var(--color-runway-critical)" : "var(--color-accent)"}
                />
                {labelled.has(d.dishId) && (
                  <text
                    x={cx + 11}
                    y={cy + 4}
                    fill="var(--color-fg)"
                    fontSize="12"
                    fontFamily="var(--font-mono)"
                  >
                    {d.name.length > 22 ? `${d.name.slice(0, 21)}…` : d.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p
        style={{
          marginTop: "var(--space-3)",
          color: "var(--color-fg-subtle)",
          fontSize: "var(--text-step--1)",
          maxWidth: "76ch",
        }}
      >
        Split on the <strong>median</strong> of each axis, not the mean, so one unusual dish
        can&rsquo;t drag the boundaries. Margin uses the ingredient cost as at the time of sale, so a
        supplier raising a price today doesn&rsquo;t rewrite last month&rsquo;s profit. Dogs are
        additionally marked in flame and named below — colour is never the only signal.
      </p>

      {/* The table twin. Every value readable without hovering anything. */}
      <div style={{ marginTop: "var(--space-5)" }}>
        <h3 className="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
          Every dish, and what to do about it
        </h3>
        <Table
          sort={hrefFor ? { key: sortKey, dir, hrefFor } : undefined}
          head={[
            { label: "Dish", sortKey: "dish" },
            { label: "Class", sortKey: "class" },
            { label: "#Sold", sortKey: "sold" },
            { label: "#Share", sortKey: "share" },
            { label: "#Price", sortKey: "price" },
            { label: "#Food cost", sortKey: "cost" },
            { label: "#Margin", sortKey: "margin" },
            "Action",
          ]}
        >
          {sortedDishes.map((d) => (
              <tr key={d.dishId}>
                <Cell strong>{d.name}</Cell>
                <Cell>
                  <Pill tone={CLASS_TONE[d.menuClass]}>{CLASS_LABEL[d.menuClass]}</Pill>
                </Cell>
                <Cell numeric>{d.unitsSold}</Cell>
                <Cell numeric tone="muted">
                  {(d.popularity * 100).toFixed(1)}%
                </Cell>
                <Cell numeric tone="muted">
                  {formatCents(d.priceCents)}
                </Cell>
                <Cell numeric tone="muted">
                  {formatCents(d.foodCostCents)}
                </Cell>
                <Cell numeric tone={d.menuClass === "dog" || d.menuClass === "plowhorse" ? "warn" : undefined}>
                  {formatCents(d.marginCents)}
                </Cell>
                <Cell tone="muted">{CLASS_ACTION[d.menuClass].split(".")[0]}</Cell>
              </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

function QuadrantLabel({
  x,
  y,
  anchor,
  name,
  hint,
}: {
  x: number;
  y: number;
  anchor: "start" | "end";
  name: string;
  hint: string;
}) {
  return (
    <>
      <text x={x} y={y} textAnchor={anchor} fill="var(--color-fg)" fontSize="14"
            fontFamily="var(--font-display)" fontWeight="700"
            letterSpacing="0.06em">
        {name.toUpperCase()}
      </text>
      <text x={x} y={y + 15} textAnchor={anchor} fill="var(--color-fg-muted)" fontSize="12"
            fontFamily="var(--font-mono)">
        {hint}
      </text>
    </>
  );
}
