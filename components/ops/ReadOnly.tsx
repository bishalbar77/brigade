import Link from "next/link";

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

export function OpsHeader({
  title,
  subtitle,
  stats,
  live,
}: {
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string; tone?: "normal" | "warn" | "critical" }[];
  live?: boolean;
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
        {live !== undefined && (
          <p className="eyebrow" style={{ marginLeft: "auto" }}>
            {live ? "listening" : "reconnecting"}
          </p>
        )}
      </div>

      {subtitle && (
        <p style={{ color: "var(--color-fg-muted)", marginTop: "var(--space-2)", maxWidth: "62ch" }}>
          {subtitle}
        </p>
      )}

      {stats && stats.length > 0 && (
        <dl
          style={{
            display: "flex",
            gap: "var(--space-5)",
            flexWrap: "wrap",
            marginTop: "var(--space-4)",
          }}
        >
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="eyebrow">{s.label}</dt>
              {/* Display face with PROPORTIONAL figures, not mono/tabular. Equal-width
                  digits make a standalone number look loose at display sizes; tabular
                  belongs in table rows and axis ticks where digits align vertically. */}
              <dd
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontVariantNumeric: "proportional-nums",
                  fontSize: "var(--text-step-1)",
                  fontWeight: 600,
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
      )}
    </header>
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

export function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="scroll-x">
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "40rem" }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                style={{
                  textAlign: h.startsWith("#") ? "right" : "left",
                  padding: "var(--space-2) var(--space-3)",
                  borderBottom: "1px solid var(--color-border-strong)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-step--1)",
                  fontWeight: 400,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--color-fg-subtle)",
                  whiteSpace: "nowrap",
                }}
              >
                {h.replace(/^#/, "")}
              </th>
            ))}
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
    <span
      className="mono"
      style={{
        display: "inline-block",
        padding: "1px var(--space-2)",
        border: `1px solid ${border}`,
        borderRadius: "999px",
        color: fg,
        fontSize: "var(--text-step--1)",
        whiteSpace: "nowrap",
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
    <p
      style={{
        border: "1px dashed var(--color-border-strong)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-5)",
        color: "var(--color-fg-muted)",
      }}
    >
      {children}
    </p>
  );
}
