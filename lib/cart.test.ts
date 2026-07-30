import { describe, expect, it } from "vitest";
import {
  EMPTY_CART,
  addLine,
  itemCount,
  overAvailability,
  qtyForDish,
  removeDish,
  removeLine,
  setDishQty,
  setNotes,
  setQty,
  subtotalCents,
  type Cart,
} from "./cart";

/*
 * The cart's pure functions.
 *
 * These exist because notes made line identity real. Before notes there was exactly one
 * line per dish, so keying everything on dishId was harmless; the moment a diner can
 * write "no chilli" on one of two butter chickens, dishId stops identifying a line and
 * every operation built on it is a latent oversell or a wrong deletion.
 *
 * localStorage is never touched here — readCart/writeCart are the only functions that
 * do, and they are thin wrappers around these.
 */

const CHICKEN = { dishId: "d-chicken", name: "Butter chicken", unitPriceCents: 48000 };
const NAAN = { dishId: "d-naan", name: "Butter naan", unitPriceCents: 8000 };

describe("addLine", () => {
  it("merges a repeat of the same dish into one line", () => {
    const cart = addLine(addLine(EMPTY_CART, CHICKEN), CHICKEN);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.qty).toBe(2);
  });

  it("gives every new line a distinct id", () => {
    const cart = addLine(addLine(EMPTY_CART, CHICKEN), NAAN);
    expect(cart.lines[0]!.id).not.toBe(cart.lines[1]!.id);
    expect(cart.lines.every((l) => l.id.length > 0)).toBe(true);
  });

  it("does NOT merge into a noted line", () => {
    // Bumping "no chilli" to 2 because someone tapped Add again would put the wrong
    // instruction on the extra plate.
    const one = addLine(EMPTY_CART, CHICKEN);
    const noted = setNotes(one, one.lines[0]!.id, "no chilli");
    const two = addLine(noted, CHICKEN);

    expect(two.lines).toHaveLength(2);
    expect(two.lines[0]!.notes).toBe("no chilli");
    expect(two.lines[0]!.qty).toBe(1);
    expect(two.lines[1]!.notes).toBeUndefined();
  });

  it("takes a quantity", () => {
    expect(addLine(EMPTY_CART, CHICKEN, 3).lines[0]!.qty).toBe(3);
  });
});

describe("setNotes", () => {
  it("trims, and stores an empty note as absent rather than as an empty string", () => {
    const cart = addLine(EMPTY_CART, CHICKEN);
    const id = cart.lines[0]!.id;

    expect(setNotes(cart, id, "  extra hot  ").lines[0]!.notes).toBe("extra hot");
    // "" would leave the line un-mergeable for a reason no diner could see.
    expect("notes" in setNotes(setNotes(cart, id, "x"), id, "   ").lines[0]!).toBe(false);
  });

  it("touches only the named line", () => {
    let cart = addLine(addLine(EMPTY_CART, CHICKEN), NAAN);
    cart = setNotes(cart, cart.lines[0]!.id, "no chilli");
    expect(cart.lines[1]!.notes).toBeUndefined();
  });
});

describe("setQty and removeLine are keyed on the LINE", () => {
  /** Two lines of the same dish — the shape notes make possible. */
  function split(): Cart {
    const one = addLine(EMPTY_CART, CHICKEN, 2);
    const noted = setNotes(one, one.lines[0]!.id, "mild");
    return addLine(noted, CHICKEN, 1);
  }

  it("changes one line and leaves its twin alone", () => {
    const cart = split();
    const next = setQty(cart, cart.lines[1]!.id, 5);
    expect(next.lines[0]!.qty).toBe(2);
    expect(next.lines[1]!.qty).toBe(5);
  });

  it("removes one line and leaves its twin alone", () => {
    const cart = split();
    const next = removeLine(cart, cart.lines[1]!.id);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]!.notes).toBe("mild");
  });

  it("treats a quantity of zero as a removal", () => {
    const cart = addLine(EMPTY_CART, CHICKEN);
    expect(setQty(cart, cart.lines[0]!.id, 0).lines).toHaveLength(0);
    expect(setQty(cart, cart.lines[0]!.id, -3).lines).toHaveLength(0);
  });
});

describe("per-dish totals", () => {
  it("sums a dish across every line carrying it", () => {
    const one = addLine(EMPTY_CART, CHICKEN, 2);
    const cart = addLine(setNotes(one, one.lines[0]!.id, "mild"), CHICKEN, 1);
    expect(qtyForDish(cart, CHICKEN.dishId)).toBe(3);
    expect(qtyForDish(cart, NAAN.dishId)).toBe(0);
  });
});

describe("overAvailability", () => {
  it("aggregates per dish, so split lines cannot collectively oversell", () => {
    // THE BUG THIS PINS: two lines of 2 against 3 available each passed an independent
    // check, and 4 portions went to a kitchen that had 3.
    const one = addLine(EMPTY_CART, CHICKEN, 2);
    const cart = addLine(setNotes(one, one.lines[0]!.id, "mild"), CHICKEN, 2);

    const problems = overAvailability(cart, { [CHICKEN.dishId]: 3 });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.ordered).toBe(4);
    expect(problems[0]!.available).toBe(3);
  });

  it("is silent when there is enough", () => {
    const cart = addLine(EMPTY_CART, CHICKEN, 2);
    expect(overAvailability(cart, { [CHICKEN.dishId]: 2 })).toEqual([]);
  });

  it("treats an unknown dish as zero available", () => {
    const cart = addLine(EMPTY_CART, CHICKEN, 1);
    expect(overAvailability(cart, {})[0]!.available).toBe(0);
  });
});

describe("setDishQty", () => {
  it("trims the newest lines first, keeping the earliest note", () => {
    const one = addLine(EMPTY_CART, CHICKEN, 2);
    const cart = addLine(setNotes(one, one.lines[0]!.id, "mild"), CHICKEN, 3);

    const next = setDishQty(cart, CHICKEN.dishId, 2);
    expect(qtyForDish(next, CHICKEN.dishId)).toBe(2);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]!.notes).toBe("mild");
  });

  it("keeps part of the second line when the first cannot absorb the whole reduction", () => {
    const one = addLine(EMPTY_CART, CHICKEN, 2);
    const cart = addLine(setNotes(one, one.lines[0]!.id, "mild"), CHICKEN, 3);

    const next = setDishQty(cart, CHICKEN.dishId, 4);
    expect(qtyForDish(next, CHICKEN.dishId)).toBe(4);
    expect(next.lines.map((l) => l.qty)).toEqual([2, 2]);
  });

  it("leaves other dishes untouched", () => {
    const cart = addLine(addLine(EMPTY_CART, CHICKEN, 3), NAAN, 2);
    const next = setDishQty(cart, CHICKEN.dishId, 1);
    expect(qtyForDish(next, NAAN.dishId)).toBe(2);
  });

  it("removes the dish entirely at zero", () => {
    const cart = addLine(addLine(EMPTY_CART, CHICKEN, 3), NAAN, 2);
    expect(qtyForDish(setDishQty(cart, CHICKEN.dishId, 0), CHICKEN.dishId)).toBe(0);
    expect(qtyForDish(setDishQty(cart, CHICKEN.dishId, 0), NAAN.dishId)).toBe(2);
  });
});

describe("removeDish", () => {
  it("removes every line carrying that dish", () => {
    const one = addLine(EMPTY_CART, CHICKEN, 2);
    const cart = addLine(addLine(setNotes(one, one.lines[0]!.id, "mild"), CHICKEN, 1), NAAN, 1);

    const next = removeDish(cart, CHICKEN.dishId);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]!.dishId).toBe(NAAN.dishId);
  });
});

describe("money and counts", () => {
  it("sums price × quantity across lines", () => {
    const cart = addLine(addLine(EMPTY_CART, CHICKEN, 2), NAAN, 3);
    expect(subtotalCents(cart)).toBe(48000 * 2 + 8000 * 3);
    expect(itemCount(cart)).toBe(5);
  });

  it("is zero for an empty cart", () => {
    expect(subtotalCents(EMPTY_CART)).toBe(0);
    expect(itemCount(EMPTY_CART)).toBe(0);
  });
});
