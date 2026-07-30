import { describe, expect, it } from "vitest";
import { formatCents, formatRate, sumLines, taxCents, tipFromPercent } from "./money";

/*
 * Money, under test because the cart once quoted a tax the bill did not charge.
 *
 * The bug was not in this file — it was a literal 0.08 in the cart while the database
 * charged the restaurant's 0.05. These tests pin the arithmetic; the end-to-end
 * assertion in scripts/verify-features.mjs pins the wiring, which is where it broke.
 */

describe("taxCents", () => {
  it("rounds once, to the nearest minor unit", () => {
    // 5% GST on ₹185 is ₹9.25 exactly.
    expect(taxCents(18500, 0.05)).toBe(925);
    // ₹480 at 5% is ₹24, not the ₹38.40 an 8% literal produced.
    expect(taxCents(48000, 0.05)).toBe(2400);
    expect(taxCents(48000, 0.08)).toBe(3840);
  });

  it("never returns a fraction of a paise", () => {
    for (const subtotal of [1, 7, 33, 99, 12345, 99999]) {
      const tax = taxCents(subtotal, 0.05);
      expect(Number.isInteger(tax)).toBe(true);
    }
  });

  it("is zero at a zero rate", () => {
    expect(taxCents(48000, 0)).toBe(0);
  });
});

describe("formatRate", () => {
  it("drops trailing zeros", () => {
    expect(formatRate(0.05)).toBe("5%");
    expect(formatRate(0.08)).toBe("8%");
    expect(formatRate(0.2)).toBe("20%");
  });

  it("keeps a real fraction rather than rounding it away", () => {
    // The bug this guards: toFixed(0) would print "8%" for a rate that is 7.5%.
    expect(formatRate(0.075)).toBe("7.5%");
    expect(formatRate(0.1225)).toBe("12.25%");
  });

  it("handles zero", () => {
    expect(formatRate(0)).toBe("0%");
  });
});

describe("formatCents", () => {
  it("drops paise when there are none", () => {
    expect(formatCents(48000)).toBe("₹480");
  });

  it("keeps paise when the arithmetic needs them", () => {
    expect(formatCents(925)).toBe("₹9.25");
  });

  it("groups in lakhs, because the locale is en-IN", () => {
    expect(formatCents(12345600)).toBe("₹1,23,456");
  });
});

describe("sumLines", () => {
  it("multiplies before summing", () => {
    expect(sumLines([{ unitPriceCents: 32000, qty: 2 }, { unitPriceCents: 18500, qty: 1 }])).toBe(
      82500,
    );
  });

  it("is zero for no lines", () => {
    expect(sumLines([])).toBe(0);
  });
});

describe("tipFromPercent", () => {
  it("takes a percent, not a rate", () => {
    expect(tipFromPercent(48000, 10)).toBe(4800);
    expect(tipFromPercent(48000, 12.5)).toBe(6000);
    expect(tipFromPercent(48000, 0)).toBe(0);
  });
});
