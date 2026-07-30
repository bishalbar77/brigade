/**
 * The cart. Pure functions plus localStorage — no server state.
 *
 * A cart is not an order. It is a private intention that becomes an order only when
 * `place_order()` accepts it, so it lives entirely in the browser until then. That
 * also means a refresh, a dropped connection or a wandering guest doesn't lose it.
 */

const KEY = "brigade.cart.v1";

export interface CartLine {
  /**
   * Line identity, distinct from dish identity.
   *
   * Needed the moment notes exist: "2 × butter chicken, mild" and "1 × butter chicken"
   * are two lines carrying the SAME dishId, so every operation keyed on dishId would
   * hit both. Quantity and removal are keyed on this; availability is still checked
   * per DISH, because the pantry does not care how many lines you split it across.
   */
  id: string;
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

/** `crypto.randomUUID` needs a secure context, which a LAN demo over http is not. */
export function newLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

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
      lines: parsed.lines
        .filter((l) => l && typeof l.dishId === "string" && Number.isFinite(l.qty) && l.qty > 0)
        // A cart saved before lines had ids is still a valid cart. Backfilling beats
        // discarding someone's order because the shape changed under them.
        .map((l) => (typeof l.id === "string" && l.id ? l : { ...l, id: newLineId() })),
    };
  } catch {
    return EMPTY_CART;
  }
}

/** What changed, for the one shared live region. See components/guest/CartAnnouncer. */
export interface CartEventDetail {
  announce?: string;
}

export const CART_EVENT = "brigade:cart";

/**
 * `announce` is what a screen reader should hear.
 *
 * It travels on the event rather than being reconstructed by the announcer, because
 * only the caller knows WHICH dish was just added — the cart afterwards is a total,
 * not a change. Existing listeners that only re-read the cart are unaffected: a
 * CustomEvent is an Event.
 */
export function writeCart(cart: Cart, announce?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(cart));
  // Same-tab listeners: the `storage` event only fires in OTHER tabs.
  window.dispatchEvent(
    new CustomEvent<CartEventDetail>(CART_EVENT, { detail: { announce } }),
  );
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent<CartEventDetail>(CART_EVENT, { detail: {} }));
}

export function addLine(cart: Cart, line: Omit<CartLine, "qty" | "id">, qty = 1): Cart {
  // Merges into the plain line for this dish, never into a noted one — bumping the
  // quantity of "no chilli" because someone tapped Add again would put the wrong
  // instruction on the extra plate.
  const existing = cart.lines.find((l) => l.dishId === line.dishId && !l.notes);
  if (existing) {
    return {
      ...cart,
      lines: cart.lines.map((l) =>
        l === existing ? { ...l, qty: l.qty + qty } : l,
      ),
    };
  }
  return { ...cart, lines: [...cart.lines, { ...line, id: newLineId(), qty }] };
}

export function setQty(cart: Cart, lineId: string, qty: number): Cart {
  if (qty <= 0) return removeLine(cart, lineId);
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.id === lineId ? { ...l, qty } : l)),
  };
}

export function removeLine(cart: Cart, lineId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.id !== lineId) };
}

/**
 * A note for the kitchen on one line.
 *
 * Trimmed, and an empty note is stored as absent rather than as "" — `addLine` tests
 * `!l.notes`, and an empty string would make a line un-mergeable for no reason a
 * diner could see.
 */
export function setNotes(cart: Cart, lineId: string, notes: string): Cart {
  const trimmed = notes.trim();
  return {
    ...cart,
    lines: cart.lines.map((l) =>
      l.id === lineId
        ? trimmed
          ? { ...l, notes: trimmed }
          : (({ notes: _drop, ...rest }) => rest)(l)
        : l,
    ),
  };
}

/**
 * Total ordered quantity for one dish, across however many lines carry it.
 *
 * The pantry is indifferent to how a guest split the order across lines, so every
 * availability question has to be asked per dish.
 */
export function qtyForDish(cart: Cart, dishId: string): number {
  return cart.lines.reduce((n, l) => (l.dishId === dishId ? n + l.qty : n), 0);
}

/**
 * Reduce a dish to `qty` in total, trimming the NEWEST lines first.
 *
 * Newest-first because the earliest line is the one most likely to carry the note the
 * guest typed, and losing that silently is worse than losing the extra they added last.
 */
export function setDishQty(cart: Cart, dishId: string, qty: number): Cart {
  if (qty <= 0) return removeDish(cart, dishId);

  let remaining = qty;
  const kept: CartLine[] = [];
  for (const line of cart.lines) {
    if (line.dishId !== dishId) {
      kept.push(line);
      continue;
    }
    if (remaining <= 0) continue;
    const take = Math.min(line.qty, remaining);
    remaining -= take;
    kept.push({ ...line, qty: take });
  }
  return { ...cart, lines: kept };
}

export function removeDish(cart: Cart, dishId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.dishId !== dishId) };
}

export function subtotalCents(cart: Cart): number {
  return cart.lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.qty, 0);
}

export interface Shortfall {
  dishId: string;
  name: string;
  /** Total across every line carrying this dish. */
  ordered: number;
  available: number;
}

/**
 * Dishes whose ordered quantity now exceeds what's actually available.
 *
 * Checked on the cart screen so the common case is caught BEFORE submitting — a
 * warning you can act on beats a rejection you can't. It does not replace the
 * server-side check: between this and the submit, another table can take the last
 * portion, and only the transaction inside `place_order()` can settle that.
 *
 * Aggregated PER DISH, not per line. Checking each line independently is the same
 * oversell bug place_order() guards against per ingredient: two lines of 2 against 3
 * available would both pass, and 4 portions would be ordered.
 */
export function overAvailability(
  cart: Cart,
  portionsByDish: Readonly<Record<string, number>>,
): Shortfall[] {
  const byDish = new Map<string, Shortfall>();

  for (const line of cart.lines) {
    const found = byDish.get(line.dishId);
    if (found) {
      found.ordered += line.qty;
    } else {
      byDish.set(line.dishId, {
        dishId: line.dishId,
        name: line.name,
        ordered: line.qty,
        available: portionsByDish[line.dishId] ?? 0,
      });
    }
  }

  return [...byDish.values()].filter((s) => s.ordered > s.available);
}
