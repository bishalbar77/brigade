/**
 * Placeholder. The real landing page is designed by `frontend-design` — see
 * screen 01 in wireframes/index.html. Deliberately undesigned so it doesn't
 * anchor the visual direction.
 */
export default function Home() {
  return (
    <main style={{ padding: "var(--space-6)", maxWidth: "60ch", margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-step-3)" }}>
        Brigade
      </h1>
      <p style={{ color: "var(--color-fg-muted)" }}>
        A printed menu is a promise the kitchen may not be able to keep.
      </p>
      <p style={{ color: "var(--color-fg-subtle)", fontSize: "var(--text-step--1)" }}>
        Foundation scaffold. Schema, RLS, <code>place_order()</code> and the runway engine are in
        place. UI pending design direction.
      </p>
    </main>
  );
}
