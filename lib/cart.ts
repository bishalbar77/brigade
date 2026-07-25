/**
 * The cart. Pure functions plus localStorage — no server state.
 *
 * A cart is not an order. It is a private intention that becomes an order only when
 * `place_order()` accepts it, so it lives entirely in the browser until then. That
 * also means a refresh, a dropped connection or a wandering guest doesn't lose it.
 */

const KEY = "brigade.cart.v1";

export interface CartLine {
  dishId: string;
  name: string;
  unitPriceCents: number;
  qty: number;
  notes?: string;
}

export interface Cart {
  tableLabel: string | null;
  lines: CartLine[];
}

export const EMPTY_CART: Cart = { tableLabel: null, lines: [] };

export function readCart(): Cart {
  if (typeof window === "undefined") return EMPTY_CART;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw) as Cart;
    // Defensive: a stale or hand-edited value must not crash the cart screen.
    if (!parsed || !Array.isArray(parsed.lines)) return EMPTY_CART;
    return {
      tableLabel: parsed.tableLabel ?? null,
      lines: parsed.lines.filter(
        (l) => l && typeof l.dishId === "string" && Number.isFinite(l.qty) && l.qty > 0,
      ),
    };
  } catch {
    return EMPTY_CART;
  }
}

export function writeCart(cart: Cart): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(cart));
  // Same-tab listeners: the `storage` event only fires in OTHER tabs.
  window.dispatchEvent(new Event("brigade:cart"));
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("brigade:cart"));
}

export function addLine(cart: Cart, line: Omit<CartLine, "qty">, qty = 1): Cart {
  const existing = cart.lines.find((l) => l.dishId === line.dishId && !l.notes);
  if (existing) {
    return {
      ...cart,
      lines: cart.lines.map((l) =>
        l === existing ? { ...l, qty: l.qty + qty } : l,
      ),
    };
  }
  return { ...cart, lines: [...cart.lines, { ...line, qty }] };
}

export function setQty(cart: Cart, dishId: string, qty: number): Cart {
  if (qty <= 0) return removeLine(cart, dishId);
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.dishId === dishId ? { ...l, qty } : l)),
  };
}

export function removeLine(cart: Cart, dishId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.dishId !== dishId) };
}

export function subtotalCents(cart: Cart): number {
  return cart.lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.qty, 0);
}

/**
 * Lines whose quantity now exceeds what's actually available.
 *
 * Checked on the cart screen so the common case is caught BEFORE submitting — a
 * warning you can act on beats a rejection you can't. It does not replace the
 * server-side check: between this and the submit, another table can take the last
 * portion, and only the transaction inside `place_order()` can settle that.
 */
export function overAvailability(
  cart: Cart,
  portionsByDish: Readonly<Record<string, number>>,
): { line: CartLine; available: number }[] {
  return cart.lines
    .map((line) => ({ line, available: portionsByDish[line.dishId] ?? 0 }))
    .filter(({ line, available }) => line.qty > available);
}
