import { describe, expect, it } from "vitest";
import {
  NEXT_STATUS,
  STATION_LABEL,
  STATIONS,
  ageLevel,
  canAdvance,
  filterDocketsByStation,
  forbiddenMessageFor,
  ticketAgeMinutes,
  type ItemStatus,
  type Station,
} from "./tickets";

/*
 * Ticket rules.
 *
 * `canAdvance` is a MIRROR of advance_item_status() in
 * supabase/patches/003_authz_and_integrity.sql:64-85. These tests are the thing that
 * keeps the two in step: if the SQL rules change and this file is not updated, the UI
 * goes back to offering buttons the database refuses — which is the bug that made a
 * chef's ticket look stuck on the pass.
 *
 * The database is still the enforcer. Nothing here withholds anything.
 */

const GRILL_CHEF = { role: "chef", station: "grill" };
const CURRY_CHEF = { role: "chef", station: "saute" };
const EXPO = { role: "expo", station: null };
const SERVER = { role: "server", station: null };
const MANAGER = { role: "manager", station: null };
const OWNER = { role: "owner", station: null };
const HOST = { role: "host", station: null };
const GUEST = { role: "guest", station: null };

const item = (status: ItemStatus, station: Station = "grill") => ({ status, station });

describe("canAdvance — a chef works their own station", () => {
  it("lets a Tandoor chef fire a Tandoor ticket", () => {
    expect(canAdvance(GRILL_CHEF, item("placed", "grill")).allowed).toBe(true);
    expect(canAdvance(GRILL_CHEF, item("fired", "grill")).allowed).toBe(true);
    expect(canAdvance(GRILL_CHEF, item("cooking", "grill")).allowed).toBe(true);
  });

  it("refuses a Tandoor chef on a Curry ticket, and does NOT blame expo", () => {
    // THE REPORTED CASE: signed in as grill, viewing the Curry filter, tapping Fire.
    const verdict = canAdvance(GRILL_CHEF, item("placed", "saute"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.who).toBe("not your station");
    // The old message cited expo's rule, which this cook was not breaking.
    expect(verdict.allowed === false && verdict.who).not.toContain("expo");
  });

  it("stays terse — the row already prints the station beside it", () => {
    // "Curry handles this" named the station twice in one row and wrapped to three
    // lines in the slot a button used to occupy, read at two metres.
    const verdict = canAdvance(CURRY_CHEF, item("placed", "grill"));
    expect(verdict.allowed === false && verdict.who.length).toBeLessThanOrEqual(20);
  });
});

describe("canAdvance — sending a plate away is not a chef's call", () => {
  it("refuses a chef at plated, even on their own station", () => {
    // This is the stuck state: the only remaining step is one a chef can never take.
    const verdict = canAdvance(GRILL_CHEF, item("plated", "grill"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.who).toBe("expo's call");
  });

  it("allows expo, a server, a manager and an owner", () => {
    for (const who of [EXPO, SERVER, MANAGER, OWNER]) {
      expect(canAdvance(who, item("plated")).allowed).toBe(true);
    }
  });
});

describe("canAdvance — firing and plating belong to the kitchen", () => {
  it("refuses a host and a server before the pass", () => {
    for (const status of ["placed", "fired", "cooking"] as ItemStatus[]) {
      for (const who of [HOST, SERVER]) {
        const verdict = canAdvance(who, item(status));
        expect(verdict.allowed).toBe(false);
        expect(verdict.allowed === false && verdict.who).toBe("kitchen only");
      }
    }
  });

  it("refuses a guest and a missing role outright", () => {
    for (const who of [GUEST, { role: null, station: null }, { role: undefined, station: undefined }]) {
      expect(canAdvance(who, item("placed")).allowed).toBe(false);
    }
  });

  it("lets expo and managers work the whole pass, regardless of station", () => {
    for (const station of STATIONS) {
      expect(canAdvance(EXPO, item("placed", station)).allowed).toBe(true);
      expect(canAdvance(MANAGER, item("cooking", station)).allowed).toBe(true);
    }
  });
});

describe("canAdvance — terminal statuses", () => {
  it("has nothing to advance for served or voided, for anyone", () => {
    for (const status of ["served", "voided"] as ItemStatus[]) {
      expect(NEXT_STATUS[status]).toBeUndefined();
      for (const who of [OWNER, EXPO, GRILL_CHEF]) {
        // Not a permission refusal — there is simply no next step, so `who` is empty
        // and the UI must render a status rather than a reason.
        const verdict = canAdvance(who, item(status));
        expect(verdict.allowed).toBe(false);
        expect(verdict.allowed === false && verdict.who).toBe("");
      }
    }
  });
});

describe("the transition chain itself", () => {
  it("runs placed → fired → cooking → plated → served and then stops", () => {
    let status: ItemStatus = "placed";
    const seen: ItemStatus[] = [status];
    while (NEXT_STATUS[status]) {
      status = NEXT_STATUS[status]!;
      seen.push(status);
    }
    expect(seen).toEqual(["placed", "fired", "cooking", "plated", "served"]);
  });

  it("labels every station", () => {
    for (const s of STATIONS) expect(STATION_LABEL[s]).toBeTruthy();
  });
});

describe("forbiddenMessageFor — five reasons, five sentences", () => {
  /*
   * These DETAIL strings are copied from advance_item_status(). Collapsing all five into
   * one sentence is the bug the user reported: a grill chef tapping Fire on a Curry
   * ticket was told "Sending a plate away is expo's call."
   */
  it("names the STATION, translated to its label, when a chef is off their section", () => {
    const msg = forbiddenMessageFor("that ticket is on saute, not your station");
    expect(msg).toContain("Curry");
    expect(msg).not.toContain("saute");
    expect(msg).not.toContain("expo");
  });

  it("blames expo only when it actually is expo's rule", () => {
    expect(forbiddenMessageFor("sending a plate away belongs to expo")).toContain("expo");
  });

  it("distinguishes the other three reasons", () => {
    expect(forbiddenMessageFor("firing and plating belong to the kitchen")).toContain("kitchen");
    expect(forbiddenMessageFor("that ticket belongs to another restaurant")).toContain("kitchen");
    expect(forbiddenMessageFor("staff only")).toBe("Staff only.");
  });

  it("gives every reason a DIFFERENT sentence", () => {
    const details = [
      "that ticket is on saute, not your station",
      "sending a plate away belongs to expo",
      "firing and plating belong to the kitchen",
      "that ticket belongs to another restaurant",
      "staff only",
    ];
    expect(new Set(details.map(forbiddenMessageFor)).size).toBe(details.length);
  });

  it("falls back rather than throwing on an unrecognised detail", () => {
    expect(forbiddenMessageFor("")).toBe("You can't move that ticket.");
    expect(forbiddenMessageFor("something new from a future patch")).toBeTruthy();
  });

  it("survives a station it cannot translate", () => {
    // A new enum value added in SQL before this map catches up must not render "undefined".
    const msg = forbiddenMessageFor("that ticket is on garnish, not your station");
    expect(msg).not.toContain("undefined");
  });
});

describe("filterDocketsByStation", () => {
  const board = [
    {
      orderId: "o1",
      tableLabel: "1",
      openedAt: "2026-07-30T19:00:00Z",
      items: [
        { id: "a", dishName: "Butter naan", qty: 2, status: "placed" as ItemStatus, station: "grill" as Station, notes: null },
        { id: "b", dishName: "Dal makhani", qty: 1, status: "placed" as ItemStatus, station: "saute" as Station, notes: null },
      ],
    },
    {
      orderId: "o2",
      tableLabel: "2",
      openedAt: "2026-07-30T19:10:00Z",
      items: [
        { id: "c", dishName: "Papdi chaat", qty: 1, status: "placed" as ItemStatus, station: "larder" as Station, notes: null },
      ],
    },
  ];

  it("returns everything for no station", () => {
    expect(filterDocketsByStation(board, null)).toHaveLength(2);
  });

  it("keeps only that station's items, and drops dockets left with none", () => {
    const grill = filterDocketsByStation(board, "grill");
    expect(grill).toHaveLength(1);
    expect(grill[0]!.orderId).toBe("o1");
    expect(grill[0]!.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("returns nothing for a station with no tickets", () => {
    expect(filterDocketsByStation(board, "pastry")).toEqual([]);
  });

  it("does not mutate the board it was given", () => {
    // The client filters the SAME array on every tab tap; mutating it would lose
    // tickets as you browsed.
    filterDocketsByStation(board, "grill");
    expect(board[0]!.items).toHaveLength(2);
    expect(filterDocketsByStation(board, null)).toHaveLength(2);
  });
});

describe("ticket age", () => {
  it("counts whole minutes and never goes negative", () => {
    const now = new Date("2026-07-30T20:00:00Z");
    expect(ticketAgeMinutes("2026-07-30T19:40:00Z", now)).toBe(20);
    expect(ticketAgeMinutes("2026-07-30T19:59:30Z", now)).toBe(0);
    // A clock skew must not render "-3m late".
    expect(ticketAgeMinutes("2026-07-30T20:05:00Z", now)).toBe(0);
  });

  it("escalates at 10 and 20 minutes", () => {
    expect(ageLevel(0)).toBe("fresh");
    expect(ageLevel(9)).toBe("fresh");
    expect(ageLevel(10)).toBe("watch");
    expect(ageLevel(19)).toBe("watch");
    expect(ageLevel(20)).toBe("late");
    expect(ageLevel(200)).toBe("late");
  });
});
