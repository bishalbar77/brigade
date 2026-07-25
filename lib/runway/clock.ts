/**
 * Timezone-aware clock for the runway engine.
 *
 * WHY THIS EXISTS. Every clock decision used to run on the ambient process
 * timezone: `date.getDay()` for which service window applies, `date.getHours()` for
 * lunch-vs-dinner, and `getHours()` again to render the predicted 86 time. That is
 * fine on a laptop in London and wrong everywhere else:
 *
 *   - Vercel runs the server in UTC, so a London restaurant's predicted 86 times were
 *     rendered an hour early — 18:23 when the wall clock said 19:25.
 *   - The SSR HTML (server zone) and the hydrated client (browser zone) could disagree
 *     about the same instant.
 *   - Worse than either: near midnight, `getDay()` in the wrong zone selects the wrong
 *     DAY's service hours, so the engine would compare "now" against Sunday's windows
 *     while the restaurant was still trading Saturday.
 *
 * `restaurants.timezone` existed in the schema from the first migration and was never
 * read. It is now the single source of truth for every clock decision, and the time is
 * formatted server-side so the client never re-derives it in its own zone.
 */

/** Sunday = 0, matching Postgres `extract(dow)` and JS `getDay()`. */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export interface ZonedParts {
  /** 0 = Sunday, in the restaurant's zone. */
  weekday: number;
  /** Minutes from local midnight, in the restaurant's zone. */
  minutes: number;
  /** "19:25", already in the restaurant's zone. */
  hhmm: string;
  /** "2026-07-25" in the restaurant's zone — the service DATE, not the UTC date. */
  dateKey: string;
}

/**
 * Break an instant into local parts for a given IANA zone.
 *
 * Uses Intl rather than arithmetic on offsets, so daylight saving is handled by the
 * platform's tz database instead of by us guessing.
 */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  // en-GB can render midnight as hour "24" under the h24 cycle.
  const rawHour = Number(parts.hour ?? "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.minute ?? "0");

  return {
    weekday: WEEKDAY_INDEX[parts.weekday ?? "Sun"] ?? 0,
    minutes: hour * 60 + minute,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** "19:25" for an instant, in the restaurant's zone. */
export function zonedClock(at: Date, timeZone: string): string {
  return zonedParts(at, timeZone).hhmm;
}

/**
 * Fall back to the host zone when a restaurant has none configured.
 *
 * Deliberately NOT "UTC": a restaurant with a blank timezone column is a data problem,
 * and silently answering in UTC produces plausible-looking times that are wrong. The
 * host zone is at least the zone of whoever is running it.
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (timeZone && timeZone.trim().length > 0) return timeZone;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
