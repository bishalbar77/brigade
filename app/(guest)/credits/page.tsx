import Link from "next/link";
import { IMAGE_CREDITS } from "@/lib/data/image-credits";

/*
 * Photo credits.
 *
 * Every dish photograph is a Creative Commons work from Wikimedia Commons, and CC BY
 * / CC BY-SA both require attribution that a reader can reach. Each dish page carries
 * its own credit; this page is the complete list, linked from the footer.
 *
 * Static: the list is a generated module (scripts/fetch-dish-images.ts writes it), so
 * there is nothing to fetch and no reason to make this dynamic.
 */

export const metadata = {
  title: "Photo credits · Brigade",
};

export default function CreditsPage() {
  return (
    <section style={{ padding: "var(--space-5) var(--space-4) var(--space-8)" }}>
      <p style={{ marginBottom: "var(--space-4)" }}>
        <Link href="/menu" style={{ color: "var(--color-fg-muted)" }}>
          ← Menu
        </Link>
      </p>

      <h1 style={{ fontSize: "var(--text-step-2)" }}>Photo credits</h1>
      <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-3) 0 var(--space-5)" }}>
        Every dish photograph comes from{" "}
        <a
          href="https://commons.wikimedia.org"
          rel="noreferrer"
          style={{ color: "var(--color-accent)" }}
        >
          Wikimedia Commons
        </a>
        , chosen by hand so each one is a photograph of the dish it illustrates. Thank you to
        the photographers.
      </p>

      {IMAGE_CREDITS.length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          No photographs are loaded yet, so the menu is showing its stand-in artwork.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-3)" }}>
          {IMAGE_CREDITS.map((c) => (
            <li
              key={c.dish}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "var(--space-4)",
                paddingBottom: "var(--space-3)",
                borderBottom: "1px solid var(--color-border)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 600 }}>{c.dish}</span>
              {/* Names are reproduced as their owners wrote them — .eyebrow would
                  uppercase them, which is not attribution, it is restyling. */}
              <span
                style={{
                  color: "var(--color-fg-muted)",
                  textAlign: "right",
                  fontSize: "var(--text-step--1)",
                }}
              >
                <a href={c.source} rel="noreferrer" style={{ color: "inherit" }}>
                  {c.author}
                </a>
                {" · "}
                {c.licenceUrl ? (
                  <a href={c.licenceUrl} rel="noreferrer" style={{ color: "inherit" }}>
                    {c.licence}
                  </a>
                ) : (
                  c.licence
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
