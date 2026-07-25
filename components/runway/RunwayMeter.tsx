import type { RunwayBand, RunwayResult } from "@/lib/runway/types";

/*
 * THE SIGNATURE ELEMENT — the portion gauge.
 *
 * Runway has two dimensions, and they are different KINDS of number:
 *   portions are DISCRETE   — there is no 3.5 portions
 *   time is CONTINUOUS      — "about 40 minutes at tonight's rate"
 *
 * So the gauge shows both, honestly. Countable ticks (one per portion) over a
 * draining time track. A cook two metres from a wall screen can COUNT the ticks
 * without reading a numeral, which is the whole point at that distance. Above
 * TICK_LIMIT the ticks give way to a numeral, because counting stops helping.
 *
 * Four independent encodings of state — tick count, colour, text label, glyph —
 * so "never colour alone" holds by construction rather than by bolting an icon
 * on afterwards. A cook reads this through glare on a grease-filmed screen.
 *
 * One component, two densities: geometry comes from CSS custom properties that
 * [data-density="ops"] overrides, so the same JSX serves 30cm and 2m.
 */

const TICK_LIMIT = 12;

/** Ticks shown as "spent" beside the live ones, to give depletion a reference. */
const SPENT_SHOWN = 4;

const BAND_COLOR: Record<RunwayBand, string> = {
  plenty: "var(--color-runway-plenty)",
  low: "var(--color-runway-low)",
  critical: "var(--color-runway-critical)",
  out: "var(--color-runway-out)",
};

/** Glyphs, not decoration: the second encoding after colour. */
const BAND_GLYPH: Record<RunwayBand, string> = {
  plenty: "",
  low: "▽",
  critical: "▼",
  out: "✕",
};

/*
 * NOTE: there is deliberately no clock formatting in this component.
 *
 * It used to call date.getHours() on predicted86At, which formats in the VIEWER's
 * timezone — so a UTC server and a London browser rendered different times for the
 * same instant, and SSR disagreed with hydration. The engine now formats it once, in
 * the restaurant's own zone, and this component only ever prints that string.
 */

/**
 * Fraction of the time track still filled.
 *
 * Anchored on a two-hour horizon: the `low` band boundary. Beyond that the
 * track is simply full, because "more than two hours" needs no gradation.
 */
function trackFraction(minutes: number | null): number {
  if (minutes === null) return 1;
  return Math.max(0.02, Math.min(1, minutes / 120));
}

export interface RunwayMeterProps {
  runway: RunwayResult;
  /** Ingredient name that binds this dish. Ops only — never shown to a guest. */
  bindingIngredientName?: string | null;
  /** Ops surfaces name the constraint and the rate; guest surfaces do not. */
  detail?: boolean;
  /** Units sold per hour, for the ops board — makes the prediction inspectable. */
  unitsPerHour?: number;
  className?: string;
}

export function RunwayMeter({
  runway,
  bindingIngredientName,
  detail = false,
  unitsPerHour,
  className = "",
}: RunwayMeterProps) {
  const {
    portions,
    band,
    runwayMinutes,
    predicted86At,
    unlimited,
    insufficientHistory,
    lastsThroughService,
    predicted86Label,
  } = runway;
  const color = BAND_COLOR[band];
  const glyph = BAND_GLYPH[band];

  /*
   * An unremarkable dish gets NO badge on a guest surface. Nothing is at stake, so
   * saying "70 left" is noise that dilutes the badges that do matter. Ops surfaces
   * pass detail and still see every row, because a manager is scanning the whole
   * menu rather than choosing one dish.
   */
  if (band === "plenty" && !detail) return null;

  // An unlimited dish has no bill of materials entered yet. It is NOT scarce and
  // must never render as a countdown — a half-configured menu should not read as
  // a closed kitchen.
  if (unlimited) {
    return (
      <p className={`eyebrow ${className}`} style={{ color: "var(--color-fg-subtle)" }}>
        no limit set
      </p>
    );
  }

  if (band === "out") {
    return (
      <p
        className={`mono ${className}`}
        style={{ color, display: "flex", alignItems: "center", gap: "var(--space-2)" }}
      >
        <span aria-hidden="true">{glyph}</span>
        <strong style={{ letterSpacing: "0.08em" }}>86</strong>
      </p>
    );
  }

  const showTicks = portions <= TICK_LIMIT;
  const spent = showTicks ? Math.min(SPENT_SHOWN, TICK_LIMIT - portions) : 0;

  // The sentence a human would say. Screen readers get this instead of the ticks.
  //
  // These branches must stay in the SAME ORDER as the visible ones below, including
  // lastsThroughService. They didn't: the visible text said "enough for tonight" while
  // this label said "runs out about 23:14" for the same dish, so a screen-reader user
  // was given a prediction the screen had deliberately suppressed. Caught by
  // npm run verify:features comparing the two counts.
  const label = [
    `${portions} portion${portions === 1 ? "" : "s"} left`,
    insufficientHistory
      ? "not enough history to predict"
      : lastsThroughService
        ? "enough for tonight"
        : predicted86At
          ? `runs out about ${runway.predicted86Label}`
          : "service closed",
  ].join(", ");

  return (
    <div className={`gauge ${className}`} style={{ color }} role="group" aria-label={label}>
      {showTicks ? (
        <div className="gauge-ticks" aria-hidden="true">
          {Array.from({ length: spent }, (_, i) => (
            <span key={`spent-${i}`} className="gauge-tick" data-spent="true" />
          ))}
          {Array.from({ length: portions }, (_, i) => (
            <span key={`live-${i}`} className="gauge-tick" />
          ))}
        </div>
      ) : (
        <p
          className="mono"
          aria-hidden="true"
          style={{ fontSize: "var(--text-step-1)", fontWeight: 600, lineHeight: 1 }}
        >
          {portions}
        </p>
      )}

      {/* The continuous half: how long those portions last at tonight's rate. */}
      {runwayMinutes !== null && (
        <div className="gauge-track" aria-hidden="true">
          <div className="gauge-fill" style={{ width: `${trackFraction(runwayMinutes) * 100}%` }} />
        </div>
      )}

      <p
        className="mono"
        style={{
          fontSize: "var(--text-step--1)",
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        {glyph && <span aria-hidden="true">{glyph}</span>}

        {/* Don't print the count twice: above TICK_LIMIT the numeral above IS the
            count, so the label only carries the unit. */}
        {showTicks ? (
          <span>
            <strong>{portions}</strong> left
          </span>
        ) : (
          <span>left</span>
        )}

        {/* Predictions are suppressed rather than fabricated. Outside service
            hours velocity is meaningless; with thin history it is a guess. A
            board predicting an 86 at 04:00 destroys trust in every other number. */}
        {insufficientHistory ? (
          <span style={{ color: "var(--color-fg-subtle)" }}>not enough history</span>
        ) : lastsThroughService ? (
          /* Correct arithmetic, useless statement: nobody needs telling the
             croquettes would run out at 02:19 if service carried on. */
          <span style={{ color: "var(--color-fg-muted)" }}>enough for tonight</span>
        ) : predicted86At ? (
          <span style={{ color: "var(--color-fg-muted)" }}>86s ~{predicted86Label}</span>
        ) : (
          <span style={{ color: "var(--color-fg-subtle)" }}>closed</span>
        )}
      </p>

      {/* Ops only. "Branzino 86s at 20:40" is information; "because you have
          four lemons" is something a chef can act on in the next five minutes. */}
      {detail && (bindingIngredientName || unitsPerHour !== undefined) && (
        <p className="eyebrow" style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {bindingIngredientName && <span>← {bindingIngredientName}</span>}
          {unitsPerHour !== undefined && unitsPerHour > 0 && (
            <span>{unitsPerHour.toFixed(1)}/hr</span>
          )}
        </p>
      )}
    </div>
  );
}
