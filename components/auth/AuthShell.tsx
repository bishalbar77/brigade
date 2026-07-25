import Link from "next/link";
import { Spinner } from "@/components/Busy";

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
      aria-busy={busy}
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
      {/* Was a bare "…". Signing in, creating an account and verifying a code are all
          network round trips — the last one waits on an email — so a single ellipsis is the
          least information this could convey. The idle label is passed in, so the busy
          state can keep the same words and just add the spinner. */}
      {busy ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
          }}
        >
          <Spinner label="Working" />
          {children}…
        </span>
      ) : (
        children
      )}
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

/**
 * What the auth pages show before their JavaScript arrives.
 *
 * Both sign-in and verify read `useSearchParams()` (for `returnTo` and a prefilled
 * email), which forces their subtree to render on the client. Their Suspense fallback was
 * `{null}`, so the prerendered HTML was a heading and nothing else: on a phone on
 * restaurant wifi, the first page a judge opens showed a bare title for as long as the
 * bundle took, with no indication a form was coming.
 *
 * Field-shaped rather than a spinner, for the same reason the route skeletons are
 * page-shaped — arriving into the right layout is most of what makes a wait feel short,
 * and nothing shifts when the real inputs replace these.
 */
export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading the form">
      {Array.from({ length: fields }, (_, i) => (
        <p key={i} style={{ marginBottom: "var(--space-4)" }}>
          <span
            className="skeleton"
            style={{ display: "block", height: "0.8rem", width: "6rem", marginBottom: "var(--space-2)" }}
          />
          <span className="skeleton" style={{ display: "block", height: "48px" }} />
        </p>
      ))}
      <span className="skeleton" style={{ display: "block", height: "48px", marginTop: "var(--space-5)" }} />
    </div>
  );
}
