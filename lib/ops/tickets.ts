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
