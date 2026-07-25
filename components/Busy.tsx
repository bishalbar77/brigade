/**
 * Waiting, said out loud.
 *
 * Every write in this app is a round trip to Postgres and back through a server
 * component — 1–2 seconds. Each action site already tracked a pending flag; none of them
 * showed it in a way you would notice. One button greyed out and kept its label; another
 * replaced "+10 portions" with "…". Both read as a tap that did not land, and the
 * reasonable response to a tap that did not land is to tap again.
 *
 * The order of the two channels matters. The LABEL is the message and the spinner is
 * decoration: a screen reader gets the label change and `aria-busy`, and the label is
 * also what remains when `prefers-reduced-motion` turns the ring into a still dot.
 *
 * The idle and busy labels should be the same verb — "Place order" becomes "Placing your
 * order…", not "Loading…". A generic spinner tells someone that something is happening;
 * naming the action tells them WHAT, which is the difference between waiting and
 * wondering.
 */
export function Spinner({ label }: { label?: string }) {
  return (
    <>
      <span className="spinner" aria-hidden="true" />
      {/* Announced once, politely — never interrupting whatever is being read. */}
      {label ? (
        <span role="status" aria-live="polite" style={{ position: "absolute", left: "-9999px" }}>
          {label}
        </span>
      ) : null}
    </>
  );
}

/**
 * A button that says what it is doing while it does it.
 *
 * Keeps the same padding and min-height in both states, so a row does not reflow under
 * the thumb that just pressed it — a shifting layout mid-tap is how the wrong ticket gets
 * fired on a KDS.
 */
export function ActionButton({
  busy,
  children,
  busyLabel,
  disabled,
  onClick,
  type = "button",
  tone = "quiet",
  style,
}: {
  busy: boolean;
  children: React.ReactNode;
  /** Same verb as the idle label, in the present continuous. */
  busyLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "quiet" | "accent";
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-2)",
        minHeight: "48px",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: tone === "accent" ? "1px solid transparent" : "1px solid var(--color-border-strong)",
        background: tone === "accent" ? "var(--color-accent)" : "transparent",
        color: tone === "accent" ? "var(--color-accent-fg)" : "var(--color-fg)",
        font: "inherit",
        fontWeight: tone === "accent" ? 600 : 400,
        cursor: busy ? "progress" : disabled ? "not-allowed" : "pointer",
        opacity: disabled && !busy ? 0.55 : 1,
        ...style,
      }}
    >
      {busy ? (
        <>
          <Spinner label={busyLabel} />
          <span>{busyLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
