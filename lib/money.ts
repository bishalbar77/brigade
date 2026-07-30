/**
 * Money is integer minor units. Everywhere. No floats.
 *
 * `0.1 + 0.2 !== 0.3` is exactly the class of bug that must never appear on a bill. The
 * field names still say `cents` because that is what the columns are called; for this
 * restaurant the minor unit is the PAISE. ₹480 is 48000.
 */

/**
 * Rupees by default, and `en-IN` on purpose — it groups in lakhs (₹1,23,456), which is
 * how the number is read here and one of those details that is wrong in every generic
 * dashboard.
 *
 * Trailing paise are dropped when there are none, because an Indian menu prices in whole
 * rupees and "₹480.00" reads like a currency converter. A bill still shows them: 5% GST
 * on ₹480 is ₹24.00, but on ₹185 it is ₹9.25, and rounding that away on the one screen
 * where the arithmetic must add up would be the wrong kind of tidy.
 *
 * The currency and locale stay parameters rather than constants: `restaurants.currency`
 * is a real column, and a second tenant billing in another currency should not need this
 * file edited.
 */
export function formatCents(cents: number, currency = "INR", locale = "en-IN"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Tax on a subtotal. Rounded ONCE, here — never per line item. Per-line rounding
 * produces bills whose lines don't add up to the total.
 */
export function taxCents(subtotalCents: number, rate: number): number {
  return Math.round(subtotalCents * rate);
}

/**
 * A tax rate as a percentage, for a label beside the amount.
 *
 * Trailing zeros are dropped, so 0.05 reads "5%" and 0.075 reads "7.5%" rather than the
 * rounded "8%" a `toFixed(0)` would print. A bill that names a rate the arithmetic
 * doesn't use is the same class of lie as the one this fixes.
 */
export function formatRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

export function sumLines(lines: readonly { unitPriceCents: number; qty: number }[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

export function tipFromPercent(subtotalCents: number, percent: number): number {
  return Math.round(subtotalCents * (percent / 100));
}
