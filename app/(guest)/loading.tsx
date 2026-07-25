/**
 * Shown while a guest page renders on the server.
 *
 * Priya is on a phone in a dim, loud room with about ninety seconds of patience. A tap
 * that produces nothing for a second and a half is a tap she assumes missed, and the menu
 * is the page that takes longest — it reads live stock and runs the runway engine over
 * every dish.
 *
 * Menu-card shaped, because that is what she asked for from every guest route that is
 * slow enough to need this.
 */
export default function GuestLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
      style={{ padding: "var(--space-5) var(--space-4)", display: "grid", gap: "var(--space-5)" }}
    >
      <div className="skeleton" style={{ height: "2rem", width: "10rem" }} />

      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "var(--space-4)",
              alignItems: "flex-start",
              // Fading down the page: the first card is what she reads, and a screen of
              // five equally-loud grey blocks looks like a rendering fault rather than
              // something arriving.
              opacity: 1 - i * 0.15,
            }}
          >
            <div style={{ flex: "1 1 auto", display: "grid", gap: "var(--space-2)" }}>
              <div className="skeleton" style={{ height: "1.2rem", width: "min(16rem, 70%)" }} />
              <div className="skeleton" style={{ height: "0.9rem", width: "min(22rem, 92%)" }} />
            </div>
            <div className="skeleton" style={{ height: "1.2rem", width: "3.5rem", flex: "0 0 auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
