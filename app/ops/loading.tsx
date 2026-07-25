/**
 * Shown while an ops page renders on the server.
 *
 * Every ops route is `force-dynamic` — they read live stock, live dockets, live bookings —
 * so each navigation is a real round trip. Without this file Next holds the PREVIOUS
 * screen on-screen, unchanged, for one to two seconds: you tap "Pantry", nothing happens,
 * you tap it again.
 *
 * Shaped like the page that is arriving rather than a spinner in the middle of an empty
 * one. Getting the layout up first is most of what makes a wait feel short, and it also
 * stops the content jumping when it lands, because the space was already the right size.
 *
 * The nav is not drawn here — it lives in the layout, so it stays put and stays tappable
 * while this renders. That is the point of putting loading.tsx below a layout.
 */
export default function OpsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading">
      <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <div className="skeleton" style={{ height: "2.25rem", width: "12rem" }} />
        <div className="skeleton" style={{ height: "1rem", width: "min(38rem, 90%)" }} />
      </div>

      {/* The stat row every ops header carries. */}
      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "grid", gap: "var(--space-2)" }}>
            <div className="skeleton" style={{ height: "0.7rem", width: "5rem", opacity: 0.6 }} />
            <div className="skeleton" style={{ height: "1.6rem", width: "4.5rem" }} />
          </div>
        ))}
      </div>

      {/* Rows. Six is about a screenful on a laptop and comfortably over one on a phone,
          so the skeleton never looks emptier than the page it stands in for. */}
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: "3.5rem", opacity: 1 - i * 0.11 }}
          />
        ))}
      </div>
    </div>
  );
}
