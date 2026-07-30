import type { RunwayResult } from "@/lib/runway/types";

/**
 * Ticket vocabulary and pure helpers — shared by server and client.
 *
 * This module exists because of a real failure: these constants originally lived in
 * `lib/data/ops.ts` alongside the Supabase queries, and the client components that
 * needed `STATION_LABEL` therefore pulled `next/headers` into the browser bundle.
 * Next.js fell back to the pages router and every route 500'd.
 *
 * So the rule, same as `lib/runway/`: NOTHING in here may import a Supabase client,
 * `next/headers`, or anything server-only. Types and pure functions only.
 */

export type ItemStatus = "placed" | "fired" | "cooking" | "plated" | "served" | "voided";
export type Station = "grill" | "saute" | "larder" | "pastry" | "bar" | "pass";

export const STATIONS: Station[] = ["grill", "saute", "larder", "pastry", "bar"];

/*
 * Kitchen vernacular is correct on ops surfaces — this is what staff actually say. In an
 * Indian kitchen that is not "Grill" and "Larder", so the LABELS are Indian while the
 * enum values stay as they are:
 *
 *   grill  -> Tandoor   kebabs, and every bread
 *   saute  -> Curry     the wet section: gravies, dals, biryani
 *   larder -> Chaat     cold assembly
 *   pastry -> Mithai
 *
 * Renaming a Postgres enum means rewriting every dependent policy, function signature and
 * index the day before a deadline, for a change that is entirely presentational. What a
 * station is CALLED belongs here; what it IS belongs to the schema. The brigade structure
 * is the same either way — that is rather the point of a brigade.
 */
export const STATION_LABEL: Record<Station, string> = {
  grill: "Tandoor",
  saute: "Curry",
  larder: "Chaat",
  pastry: "Mithai",
  bar: "Bar",
  pass: "Pass",
};

/** The only legal forward transitions. Mirrors advance_item_status() in SQL, which
    is what actually enforces them — this just stops the UI offering an illegal one. */
export const NEXT_STATUS: Partial<Record<ItemStatus, ItemStatus>> = {
  placed: "fired",
  fired: "cooking",
  cooking: "plated",
  plated: "served",
};

/** The verb a cook would actually tap. */
export const STATUS_ACTION: Partial<Record<ItemStatus, string>> = {
  placed: "Fire",
  fired: "Cooking",
  cooking: "Plate",
  plated: "Away",
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  placed: "on order",
  fired: "fired",
  cooking: "cooking",
  plated: "on the pass",
  served: "away",
  voided: "voided",
};

export interface DocketItem {
  id: string;
  dishName: string;
  qty: number;
  status: ItemStatus;
  station: Station;
  notes: string | null;
}

export interface Docket {
  orderId: string;
  tableLabel: string;
  openedAt: string;
  items: DocketItem[];
}

export interface RunwayRow {
  dishId: string;
  name: string;
  station: Station;
  priceCents: number;
  runway: RunwayResult;
  bindingIngredientId: string | null;
  bindingIngredientName: string | null;
  bindingStockQty: number | null;
  unitsPerHour: number;
  sampleCount: number;
}

/**
 * Narrow the board to one station.
 *
 * Shared by `getKdsData()` on the server and `KdsBoard` on the client so the two cannot
 * drift. The client needs it because station switching used to be a `?station=` link:
 * every tap was a 2.5-second `force-dynamic` round trip that ALSO re-fetched the runway
 * board, which does not depend on the station at all. Filtering here is instant.
 *
 * Keeps the items on that station, then drops any docket left with none — a ticket with
 * nothing for you on it is not your ticket.
 */
export function filterDocketsByStation(
  dockets: readonly Docket[],
  station: Station | null,
): Docket[] {
  if (!station) return [...dockets];
  return dockets
    .map((d) => ({ ...d, items: d.items.filter((it) => it.station === station) }))
    .filter((d) => d.items.length > 0);
}

/**
 * Who is allowed to take this item to its next status.
 *
 * A MIRROR of `advance_item_status()` — the source of truth is
 * `supabase/patches/003_authz_and_integrity.sql:64-85`, and RLS is what actually
 * enforces it (ADR-3). Nothing here withholds anything; it only stops the UI OFFERING
 * an action that will be refused.
 *
 * That mattered: the docket rendered the next-step button for every item regardless of
 * who was looking. `plated → served` is expo's, never a chef's, so a chef's ticket sat
 * on the pass behind a button that 403'd on every tap, with nothing on screen saying
 * who could clear it. That is what "stuck" meant.
 *
 * Returns the roles that CAN act when the viewer cannot, so the UI can name them
 * instead of showing a dead control.
 */
export interface Viewer {
  role: string | null | undefined;
  /** Only meaningful for `chef` — a chef de partie works one station. */
  station: string | null | undefined;
}

const KITCHEN_ROLES = ["chef", "expo", "manager", "owner"];
const AWAY_ROLES = ["expo", "server", "manager", "owner"];

export function canAdvance(
  viewer: Viewer,
  item: { status: ItemStatus; station: Station },
): { allowed: true } | { allowed: false; who: string } {
  const role = viewer.role ?? "";
  const to = NEXT_STATUS[item.status];

  // Nothing to advance (served, voided) — not a permission answer.
  if (!to) return { allowed: false, who: "" };

  /*
   * `who` is deliberately TERSE. It is read at two metres on a wall screen, in the slot
   * a button used to occupy, on a row that ALREADY prints the station and the status —
   * "CURRY · ON ORDER". An earlier draft said "Curry handles this", which named the
   * station a second time in the same row and wrapped onto three lines.
   */
  if (to === "served") {
    if (!AWAY_ROLES.includes(role)) return { allowed: false, who: "expo's call" };
    return { allowed: true };
  }

  // fired | cooking | plated
  if (!KITCHEN_ROLES.includes(role)) {
    return { allowed: false, who: "kitchen only" };
  }

  // A chef de partie works THEIR station. Expo and managers work the whole pass.
  if (role === "chef" && viewer.station !== item.station) {
    return { allowed: false, who: "not your station" };
  }

  return { allowed: true };
}

/**
 * Why `advance_item_status()` refused, in words a cook can act on.
 *
 * Lives here rather than in the route so it can be unit-tested, and because it is pure
 * string work over the ticket vocabulary.
 *
 * The function raises FORBIDDEN for FIVE different reasons and names each in the
 * exception's DETAIL. The route used to collapse all five into "Sending a plate away is
 * expo's call." — so a Tandoor chef tapping FIRE on a Curry ticket was told about expo
 * and plates, a rule they were not breaking. The message named the wrong problem, and
 * the ticket then looked stuck because nothing said what to do instead.
 *
 * Matched on DETAIL, most specific first. Source of truth:
 * supabase/patches/003_authz_and_integrity.sql:36-85.
 */
export function forbiddenMessageFor(detail: string): string {
  if (detail.includes("not your station")) {
    // The detail carries the raw enum ("saute"); a cook reads the label ("Curry").
    const raw = /on (\w+), not your station/.exec(detail)?.[1] as Station | undefined;
    const label = raw ? (STATION_LABEL[raw] ?? raw) : null;
    return label
      ? `That ticket is on ${label} — not your station.`
      : "That ticket is on another station.";
  }
  if (detail.includes("belongs to expo")) return "Sending a plate away is expo's call.";
  if (detail.includes("belong to the kitchen")) return "Firing and plating are the kitchen's call.";
  if (detail.includes("another restaurant")) return "That ticket isn't from this kitchen.";
  if (detail.includes("staff only")) return "Staff only.";
  return "You can't move that ticket.";
}

/** Minutes a docket has been open. The critical number on a wall screen. */
export function ticketAgeMinutes(openedAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(openedAt).getTime()) / 60_000));
}

/** Age escalation. Encoded redundantly in the UI — never colour alone. */
export function ageLevel(minutes: number): "fresh" | "watch" | "late" {
  if (minutes >= 20) return "late";
  if (minutes >= 10) return "watch";
  return "fresh";
}
