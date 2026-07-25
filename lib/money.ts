/**
 * Money is integer cents. Everywhere. No floats.
 *
 * `0.1 + 0.2 !== 0.3` is exactly the class of bug that must never appear on a bill.
 */

export function formatCents(cents: number, currency = "GBP", locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/**
 * Tax on a subtotal. Rounded ONCE, here — never per line item. Per-line rounding
 * produces bills whose lines don't add up to the total.
 */
export function taxCents(subtotalCents: number, rate: number): number {
  return Math.round(subtotalCents * rate);
}

export function sumLines(lines: readonly { unitPriceCents: number; qty: number }[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

export function tipFromPercent(subtotalCents: number, percent: number): number {
  return Math.round(subtotalCents * (percent / 100));
}
