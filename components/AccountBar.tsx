import Link from "next/link";
import { ROLE_TITLE, type AppRole } from "@/lib/auth/roles";

/**
 * Who you are signed in as, and the way out.
 *
 * Neither shell had this. The guest header showed "Sign in" whether or not you already
 * were, and the ops shell showed nothing at all — so anyone signed in as the grill chef
 * was stuck as the grill chef, with no way to become the owner and look at the numbers
 * short of clearing cookies. For a platform whose entire authorization story is seven
 * roles, being unable to see or change which one you are is the wrong first impression.
 *
 * A plain form POSTing to /auth/sign-out, so this needs no client JavaScript and works
 * with JS off. POST rather than a link is deliberate — the route rejects GET, because a
 * prefetch or an image tag pointing at a GET sign-out logs people out for no reason.
 *
 * `variant` carries the two-audience split: ops surfaces name the brigade role (a cook
 * recognises "Chef de partie") and the station, because on a shared wall screen "who is
 * this logged in as" is a real question. Guest surfaces get a first name and nothing
 * else — a diner has no role to be told about.
 */
export function AccountBar({
  name,
  role,
  station,
  variant,
}: {
  name: string | null | undefined;
  role?: string | null;
  station?: string | null;
  variant: "guest" | "ops";
}) {
  if (!name) {
    return (
      <Link
        href="/auth/sign-in"
        role="button"
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: "44px",
          padding: "0 var(--space-4)",
          borderRadius: "var(--radius-md)",
          background: variant === "ops" ? "transparent" : "var(--color-accent)",
          border: variant === "ops" ? "1px solid var(--color-border)" : "1px solid transparent",
          color: variant === "ops" ? "var(--color-fg)" : "var(--color-accent-fg)",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Sign in
      </Link>
    );
  }

  // First name only in the guest header: it is 375px wide and she knows her own surname.
  const shown = variant === "guest" ? name.split(" ")[0] : name;
  const title = role ? ROLE_TITLE[role as AppRole] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          lineHeight: 1.15,
          textAlign: "right",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--color-fg)" }}>{shown}</span>
        {variant === "ops" && title && (
          <span className="eyebrow" style={{ fontSize: "0.7rem" }}>
            {title}
            {station ? ` · ${station}` : ""}
          </span>
        )}
      </span>

      <form method="post" action="/auth/sign-out" style={{ margin: 0 }}>
        <button
          type="submit"
          style={{
            minHeight: "44px",
            padding: "0 var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "transparent",
            color: "var(--color-fg-muted)",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
