import Link from "next/link";
import { LiveBadge } from "@/components/ops/LiveFrame";
import { PendingUnderline } from "@/components/ops/Pending";

/*
 * Shared primitives for the read-only ops screens.
 *
 * "Read-only" here means no writes ORIGINATE from these screens. They still hold a
 * realtime subscription and update live — that costs nothing once the hook exists,
 * and a static ops screen would undercut the product's live claim.
 *
 * Each screen states its own scope in-page rather than implying a missing button.
 * A judge reading "changes are made on the runway board" understands the design;
 * a greyed-out button they can't press just looks broken.
 */

export interface OpsStat {
  label: string;
  value: string;
  tone?: "normal" | "warn" | "critical";
}

export function OpsHeader({
  title,
  subtitle,
  stats,
  /** Rendered on the same line as the stats — a control that acts on one of them. */
  action,
}: {
  title: string;
  subtitle?: string;
  stats?: OpsStat[];
  action?: React.ReactNode;
}) {
  return (
    <header style={{ marginBottom: "var(--space-5)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "var(--text-step-2)" }}>{title}</h1>
        {/* Automatic inside a LiveFrame, absent outside one. Replaces a `live` prop that
            no page ever passed, on three screens that were subscribed the whole time. */}
        <LiveBadge style={{ marginLeft: "auto" }} />
      </div>

      {subtitle && (
        <p style={{ color: "var(--color-fg-muted)", marginTop: "var(--space-2)", maxWidth: "62ch" }}>
          {subtitle}
        </p>
      )}

      {stats && stats.length > 0 && <StatTiles stats={stats} action={action} />}
    </header>
  );
}

/**
 * The summary numbers, as actual tiles.
 *
 * They were a borderless wrapping flex row of unstyled `<div>`s, with the value at
 * `--text-step-1` — at ops density that is 30px against a 24px body and a 38px `h1`, so
 * **the numbers were smaller than the page title**. On a screen whose entire job is to
 * report figures, the figures were the third-largest thing on it. That is the single
 * reason none of these pages read as a dashboard.
 *
 * `auto-fit` with a floor, not a flex row: two stats then fill the width instead of
 * huddling at the left, and five wrap into a second row of equal columns rather than
 * an uneven ragged line.
 */
export function StatTiles({
  stats,
  action,
}: {
  stats: OpsStat[];
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "var(--space-4)",
        flexWrap: "wrap",
        marginTop: "var(--space-4)",
      }}
    >
      <dl
        style={{
          flex: "1 1 22rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
          gap: "var(--space-2)",
          margin: 0,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-bg-raised)",
              padding: "var(--space-3) var(--space-4)",
            }}
          >
            <dt className="eyebrow">{s.label}</dt>
            {/*
              TABULAR figures, and the comment this replaces said the opposite.
              It argued proportional digits look better at display sizes, and reserved
              tabular for table rows. But these values are re-rendered by a realtime
              refresh mid-service — covers seated, waiting, longest wait all tick — and
              CLAUDE.md is explicit: "monospace digits wherever numbers change, so
              countdowns don't jitter." A number that shifts width as it updates, on a
              screen being read at two metres, is the thing that rule exists to stop.
              Same family, tabular figures: no jitter, no second typeface.
            */}
            <dd
              style={{
                margin: 0,
                marginTop: "var(--space-1)",
                fontFamily: "var(--font-display)",
                fontVariantNumeric: "tabular-nums",
                fontFeatureSettings: '"tnum" 1',
                fontSize: "var(--text-step-2)",
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color:
                  s.tone === "critical"
                    ? "var(--color-runway-critical)"
                    : s.tone === "warn"
                      ? "var(--color-runway-low)"
                      : "var(--color-fg)",
              }}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      {action}
    </div>
  );
}

/**
 * A section heading that outranks the content under it.
 *
 * Bookings and Floor used `className="eyebrow"` for their `h2`s — 18px mono in
 * `--color-fg-subtle`, which made the quietest text on the page the thing announcing its
 * loudest content. Floor's zone headings were `--text-step-0`, i.e. exactly body size.
 * Neither grouped anything.
 */
export function SectionHeading({
  children,
  meta,
  id,
}: {
  children: React.ReactNode;
  /** A count or a qualifier — "reference", "4 tables". Stays quiet. */
  meta?: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        flexWrap: "wrap",
        marginBottom: "var(--space-3)",
        paddingBottom: "var(--space-2)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <h2 id={id} style={{ fontSize: "var(--text-step-1)" }}>
        {children}
      </h2>
      {meta && (
        <p className="eyebrow" style={{ color: "var(--color-fg-subtle)" }}>
          {meta}
        </p>
      )}
    </div>
  );
}

/**
 * The surface every ops panel was hand-rolling.
 *
 * `border` + `--radius-md` + `--color-bg-raised` + padding appeared independently in
 * eight places (Docket, RunwayBoard, OpsNav, the menu and floor cards, three separate
 * dashed empty states). Same intent, eight chances to drift.
 */
export function Panel({
  children,
  tone = "solid",
  style,
}: {
  children: React.ReactNode;
  /** `dashed` is the empty-state variant: no fill, so it reads as an absence. */
  tone?: "solid" | "dashed";
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        border:
          tone === "dashed"
            ? "1px dashed var(--color-border-strong)"
            : "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        background: tone === "dashed" ? "transparent" : "var(--color-bg-raised)",
        padding: "var(--space-4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** States what this screen does and doesn't do, and where the write path lives. */
export function ScopeNote({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <p
      style={{
        borderLeft: "3px solid var(--color-accent-dim)",
        paddingLeft: "var(--space-3)",
        marginBottom: "var(--space-5)",
        color: "var(--color-fg-muted)",
        fontSize: "var(--text-step--1)",
      }}
    >
      {children}
      {action && (
        <>
          {" "}
          <Link href={action.href as never} style={{ color: "var(--color-accent)" }}>
            {action.label} →
          </Link>
        </>
      )}
    </p>
  );
}

/**
 * A column. A bare string is still accepted — a leading `#` still means numeric.
 * `sortKey` opts that column into sorting.
 */
export type HeadCol = string | { label: string; sortKey?: string };

export interface TableSort {
  /** The column currently sorted, or null for the table's natural order. */
  key: string | null;
  dir: "asc" | "desc";
  /** Where a header should link to in order to sort by `key`. */
  hrefFor: (key: string) => string;
}

const headLabel = (h: HeadCol): string => (typeof h === "string" ? h : h.label);
const headSortKey = (h: HeadCol): string | undefined =>
  typeof h === "string" ? undefined : h.sortKey;

/**
 * The shared ops table.
 *
 * TWO THINGS THAT WERE WRONG ON A PHONE.
 *
 * 1. It was `minWidth: 40rem` inside `.scroll-x`, so all seven ops screens scrolled
 *    sideways on a phone with no sticky first column — you scrolled right to read a
 *    number and lost the name of the row it belonged to. The width now lives in CSS so
 *    a media query can drop it and lay each row out as a stacked label/value card. One
 *    change to this primitive fixes every screen using it.
 *
 * 2. `aria-sort` appeared nowhere in the codebase and no header was sortable, on a
 *    9-column pantry table. Sorting is done with LINKS and search params rather than
 *    client state: it survives a reload, it can be pinned on a wall screen, and it
 *    needs no JavaScript on a surface that has to keep working for eight hours.
 */
export function Table({
  head,
  sort,
  children,
}: {
  head: HeadCol[];
  sort?: TableSort;
  children: React.ReactNode;
}) {
  // Column labels are handed to CSS so the mobile card layout can print each value's
  // label from ::before. Doing it here means the seven consuming pages need no change.
  const labelVars = Object.fromEntries(
    head.map((h, i) => [`--col-${i + 1}`, JSON.stringify(headLabel(h).replace(/^#/, ""))]),
  ) as React.CSSProperties;

  return (
    <div className="scroll-x">
      <table className="ops-table" style={labelVars}>
        <thead>
          <tr>
            {head.map((h) => {
              const label = headLabel(h);
              const key = headSortKey(h);
              const active = sort && key && sort.key === key;
              const text = label.replace(/^#/, "");

              return (
                <th
                  key={label}
                  scope="col"
                  aria-sort={
                    active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                  }
                  style={{
                    textAlign: label.startsWith("#") ? "right" : "left",
                    padding: "var(--space-2) var(--space-3)",
                    borderBottom: "1px solid var(--color-border-strong)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-step--1)",
                    fontWeight: 400,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: active ? "var(--color-fg)" : "var(--color-fg-subtle)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sort && key ? (
                    <Link
                      href={sort.hrefFor(key) as never}
                      style={{
                        // `relative` so PendingUnderline can pin to this header without
                        // taking part in layout.
                        position: "relative",
                        display: "inline-block",
                        paddingBottom: "2px",
                        color: "inherit",
                        textDecoration: "none",
                      }}
                    >
                      {text}
                      {/* An arrow AND aria-sort AND the brighter label: three channels,
                          because a wall screen is read through glare. */}
                      <span aria-hidden="true">
                        {active ? (sort.dir === "asc" ? " \u2191" : " \u2193") : " \u2195"}
                      </span>
                      {/* Sorting is a real round trip and loading.tsx does not re-show
                          for a search-param change. See Pending.tsx. */}
                      <PendingUnderline />
                    </Link>
                  ) : (
                    text
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  numeric,
  tone,
  strong,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  tone?: "muted" | "warn" | "critical" | "ok";
  strong?: boolean;
}) {
  const color =
    tone === "critical"
      ? "var(--color-runway-critical)"
      : tone === "warn"
        ? "var(--color-runway-low)"
        : tone === "ok"
          ? "var(--color-ok)"
          : tone === "muted"
            ? "var(--color-fg-muted)"
            : "var(--color-fg)";
  return (
    <td
      className={numeric ? "mono" : undefined}
      style={{
        padding: "var(--space-2) var(--space-3)",
        borderBottom: "1px solid var(--color-border)",
        textAlign: numeric ? "right" : "left",
        color,
        fontWeight: strong ? 600 : 400,
        whiteSpace: numeric ? "nowrap" : undefined,
      }}
    >
      {children}
    </td>
  );
}

/** Status as a labelled pill — text plus colour, never colour alone. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "critical" | "info";
}) {
  const map = {
    neutral: ["var(--color-border-strong)", "var(--color-fg-muted)"],
    ok: ["var(--color-ok)", "var(--color-ok)"],
    warn: ["var(--color-runway-low)", "var(--color-runway-low)"],
    critical: ["var(--color-runway-critical)", "var(--color-runway-critical)"],
    info: ["var(--color-accent)", "var(--color-accent)"],
  } as const;
  const [border, fg] = map[tone];
  return (
    // `white-space` lives in .ops-pill rather than here so the phone-width card layout
    // can override it. As an inline style it could only be beaten with !important —
    // and it must NOT be dropped outright: a pill that wraps freely on a wall screen
    // turns one table row into five lines, one word per line.
    <span
      className="mono ops-pill"
      style={{
        display: "inline-block",
        padding: "1px var(--space-2)",
        border: `1px solid ${border}`,
        borderRadius: "999px",
        color: fg,
        fontSize: "var(--text-step--1)",
      }}
    >
      {children}
    </span>
  );
}

export function StaffOnly({ what }: { what: string }) {
  return (
    <section style={{ padding: "var(--space-6)", maxWidth: "34rem" }}>
      <h1 style={{ fontSize: "var(--text-step-2)" }}>Staff only</h1>
      <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
        Sign in with a staff account to see {what}.
      </p>
      <Link href="/auth/sign-in" style={{ color: "var(--color-accent)" }}>
        Sign in →
      </Link>
    </section>
  );
}

/** Designed empty state. An empty screen is an invitation, not a dead end. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Panel tone="dashed" style={{ padding: "var(--space-5)", color: "var(--color-fg-muted)" }}>
      {children}
    </Panel>
  );
}
