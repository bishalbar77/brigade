import { EWMA_ALPHA, MIN_VELOCITY_SAMPLES, type Velocity } from "./types";
import { zonedParts } from "./clock";

/**
 * How fast a dish actually sells, segmented by weekday and daypart — because
 * Saturday dinner and Tuesday lunch are different restaurants.
 *
 * See docs/05-runway-engine.md §2.
 */

/**
 * Exponentially weighted moving average over same-slot samples.
 *
 * samples are ordered OLDEST FIRST. alpha weights the most recent observation;
 * 0.3 responds to a trend without letting one unusual night dominate.
 */
export function ewma(samples: readonly number[], alpha: number = EWMA_ALPHA): number {
  if (samples.length === 0) return 0;
  let acc = samples[0]!;
  for (let i = 1; i < samples.length; i++) {
    acc = alpha * samples[i]! + (1 - alpha) * acc;
  }
  return acc;
}

/**
 * Velocity for one (dish, weekday, daypart) slot.
 *
 * `samples` is units-sold-per-hour for the last K occurrences of that slot,
 * oldest first. K is 6 in practice — six weeks of the same slot, which is why the
 * seed script generates six weeks of history.
 */
export function computeVelocity(samples: readonly number[]): Velocity {
  return { unitsPerHour: ewma(samples), sampleCount: samples.length };
}

/**
 * Resolve a usable velocity, with fallbacks.
 *
 * Cold start MUST NOT return 0: a zero rate makes runway infinite, which silently
 * removes the entire feature rather than showing an honest "not enough history".
 * The caller distinguishes the two via `insufficientHistory`.
 */
export function resolveVelocity(
  dishVelocity: Velocity | undefined,
  categoryMean: number | undefined,
  globalMean: number,
): { unitsPerHour: number; insufficientHistory: boolean } {
  if (dishVelocity && dishVelocity.sampleCount >= MIN_VELOCITY_SAMPLES && dishVelocity.unitsPerHour > 0) {
    return { unitsPerHour: dishVelocity.unitsPerHour, insufficientHistory: false };
  }

  const fallback =
    categoryMean && categoryMean > 0 ? categoryMean : globalMean > 0 ? globalMean : 0;

  return { unitsPerHour: fallback, insufficientHistory: true };
}

/**
 * Weekday as Postgres/JS agree on it: 0 = Sunday.
 *
 * `timeZone` is required for correctness in production — without it this answers in
 * the ambient process zone, which on a UTC server picks the wrong DAY's service hours
 * either side of midnight. See lib/runway/clock.ts.
 */
export function weekdayOf(date: Date, timeZone?: string): number {
  return timeZone ? zonedParts(date, timeZone).weekday : date.getDay();
}

export interface DaypartWindow {
  name: string;
  startMinutes: number; // minutes from midnight
  endMinutes: number;
}

export function minutesFromMidnight(date: Date, timeZone?: string): number {
  if (timeZone) return zonedParts(date, timeZone).minutes;
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Which daypart `date` falls in, or null when the restaurant is closed.
 *
 * Returning null is load-bearing: outside service hours velocity is meaningless,
 * so runway must be suppressed rather than predicting an 86 at 04:00. A board that
 * does that destroys trust in every other number on the screen.
 */
export function currentDaypart(
  date: Date,
  windows: readonly DaypartWindow[],
  timeZone?: string,
): DaypartWindow | null {
  const m = minutesFromMidnight(date, timeZone);
  for (const w of windows) {
    if (m >= w.startMinutes && m < w.endMinutes) return w;
  }
  return null;
}

export function isServiceOpen(
  date: Date,
  windows: readonly DaypartWindow[],
  timeZone?: string,
): boolean {
  return currentDaypart(date, windows, timeZone) !== null;
}

/**
 * Minutes-from-midnight at which tonight's service ends, or null when closed all day.
 *
 * Used to decide whether a dish outlasts the night. A prediction beyond closing is
 * arithmetically correct and useless — nobody needs to be told the croquettes would
 * run out at 02:19 if service continued, because it won't.
 */
export function serviceEndMinutes(windows: readonly DaypartWindow[]): number | null {
  if (windows.length === 0) return null;
  return Math.max(...windows.map((w) => w.endMinutes));
}
