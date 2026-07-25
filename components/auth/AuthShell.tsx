import Link from "next/link";

/*
 * Shared frame for the auth screens.
 *
 * Errors here explain what happened and what to do about it, in the interface's
 * voice. They don't apologise and they're never vague — "That code expired. Send a
 * new one." beats "Authentication error".
 */

export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section style={{ padding: "var(--space-6) var(--space-4) var(--space-8)", maxWidth: "26rem" }}>
      <p className="eyebrow">Brigade</p>
      <h1 style={{ fontSize: "var(--text-step-2)", margin: "var(--space-3) 0" }}>{title}</h1>
      {intro && (
        <p style={{ color: "var(--color-fg-muted)", marginBottom: "var(--space-5)" }}>{intro}</p>
      )}
      {children}
      {footer && (
        <div
          style={{
            marginTop: "var(--space-5)",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid var(--color-border)",
            color: "var(--color-fg-muted)",
            fontSize: "var(--text-step--1)",
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = props.id ?? props.name;
  return (
    <p style={{ marginBottom: "var(--space-4)" }}>
      {/* A real label, never placeholder-only: a placeholder disappears the moment
          you start typing, which is exactly when you might need it. */}
      <label htmlFor={id} className="eyebrow" style={{ display: "block", marginBottom: "var(--space-1)" }}>
        {label}
      </label>
      <input
        id={id}
        {...props}
        style={{
          width: "100%",
          minHeight: "48px",
          padding: "0 var(--space-3)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border-strong)",
          background: "var(--color-bg-sunken)",
          color: "var(--color-fg)",
          font: "inherit",
        }}
      />
      {hint && (
        <span
          style={{
            display: "block",
            marginTop: "var(--space-1)",
            color: "var(--color-fg-subtle)",
            fontSize: "var(--text-step--1)",
          }}
        >
          {hint}
        </span>
      )}
    </p>
  );
}

export function SubmitButton({
  children,
  busy,
  ...props
}: { busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      disabled={busy || props.disabled}
      {...props}
      style={{
        width: "100%",
        minHeight: "48px",
        borderRadius: "var(--radius-md)",
        border: "none",
        background: "var(--color-accent)",
        color: "var(--color-accent-fg)",
        font: "inherit",
        fontWeight: 600,
        cursor: busy ? "progress" : "pointer",
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? "…" : children}
    </button>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      style={{
        marginBottom: "var(--space-4)",
        padding: "var(--space-3)",
        borderLeft: "3px solid var(--color-runway-critical)",
        background: "var(--color-bg-sunken)",
        color: "var(--color-fg)",
        fontSize: "var(--text-step--1)",
      }}
    >
      {children}
    </p>
  );
}

export function GoogleButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        width: "100%",
        minHeight: "48px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-strong)",
        background: "transparent",
        color: "var(--color-fg)",
        font: "inherit",
        cursor: "pointer",
      }}
    >
      Continue with Google
    </button>
  );
}

export function AuthAlt({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        margin: "var(--space-4) 0",
        color: "var(--color-fg-subtle)",
        fontSize: "var(--text-step--1)",
      }}
    >
      <span style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      {children}
      <span style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as never} style={{ color: "var(--color-accent)" }}>
      {children}
    </Link>
  );
}
