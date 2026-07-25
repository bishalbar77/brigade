/*
 * Honest stub for a route that exists in the nav but isn't built yet.
 *
 * Every planned route gets one from the start, so `typedRoutes` keeps catching
 * broken links and a demo never lands on a 404. It states which build step owns
 * it rather than pretending to be empty data — an empty table looks like a bug,
 * a stated scope does not.
 */
export function Placeholder({
  title,
  step,
  children,
}: {
  title: string;
  step: string;
  children?: React.ReactNode;
}) {
  return (
    <section style={{ padding: "var(--space-6) var(--space-4)", maxWidth: "44rem" }}>
      <p className="eyebrow">{step}</p>
      <h1 style={{ fontSize: "var(--text-step-2)", margin: "var(--space-3) 0" }}>{title}</h1>
      <p style={{ color: "var(--color-fg-muted)" }}>
        {children ?? "Not built yet."}
      </p>
    </section>
  );
}
