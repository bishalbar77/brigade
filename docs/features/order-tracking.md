# Order tracking

**User story:** US3 (Silver) · **Status:** built

_As deployed:_ `/order/[id]`, per-item rail, live.

**Problem it solves:** "Delayed communication between customers, staff, and kitchen" and "long waiting
times for orders." A guest who can see their food's progress stops asking the server, which removes a
trip for the server too. One feature, both sides.

## Behaviour

After placing an order the guest lands on `/order/[id]` and sees a live rail per item:

```
placed ──▶ fired ──▶ cooking ──▶ plated ──▶ served
```

Per-item, not per-order — the starter can be served while the main is still on the grill, and an
order-level status cannot express that.

The guest also sees an estimated time for anything not yet plated, derived from `dishes.prep_minutes`
plus current kitchen load. Estimates are shown as ranges, never a precise countdown: a wrong precise
number is worse than an honest range.

Status changes arrive live. No refresh, no polling.

## Screens

`/order/[id]` — also the entry point to [billing.md](billing.md) once everything is served.

## Data

- **Reads** `orders`, `order_items`, `dishes.name`, `dishes.prep_minutes`
- **Writes** none from this surface — the guest is a reader here; transitions come from the KDS

## API

Server component for first paint, then a client subscription. No polling endpoint.

## Realtime

Subscribes to `order:{id}`. Receives `order_items` status updates for this order only — not the whole
restaurant's traffic, which would leak other tables' activity to a guest.

## Rules & edge cases

- **RLS restricts this to the order's owner** (or same-restaurant staff). A guest changing the URL to
  another order id gets nothing — enforced in the database.
- Item `voided` → shown as cancelled with a reason, not silently removed. Something disappearing without
  explanation is worse than bad news.
- All items `served` → the rail collapses to a summary and surfaces "View bill."
- Realtime drops (tunnel, lift, flaky wifi) → refetch on reconnect and on tab focus. The screen must
  self-heal rather than sit on stale state.
- Guest closes and reopens the tab → state fully restored from the server.
- Estimates are suppressed rather than shown as `0` when kitchen load can't be computed.

## Verification

- Place an order, advance status from the KDS, confirm each transition appears on the guest screen in
  ~1s without a reload
- Two items on one order advance independently
- Voiding an item shows it as cancelled with a reason
- Another guest's order id returns nothing (tested against the REST API directly, not just the UI)
- Kill the network, restore it, confirm the screen catches up rather than staying stale
- All-served state offers the bill

## Cut-line

Keep. This is half of the "delayed communication" story and it's cheap once realtime exists for the KDS.
If pressed: **drop the time estimates**, keep the status rail. The rail is the value; the estimate is
the polish.
