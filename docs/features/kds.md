# KDS — kitchen display system

**User story:** US4 (Gold) · **Status:** built

_As deployed:_ `/ops/kds` with the runway rail. Station filtering enforced in `advance_item_status()` after patch 003 — it was UI-only before.

**Problem it solves:** "Delayed communication between customers, staff, and kitchen" and "inefficient
staff coordination." This is the screen the whole demo is built around — and per
[../06-roadmap.md](../06-roadmap.md) it is never cut.

## Behaviour

A wall-mounted screen in the kitchen showing live dockets, partitioned into **station lanes** (grill,
sauté, larder, pastry, bar). A `chef` sees only their station; `expo` sees all of them.

Each docket shows table, order time, **ticket age**, and its items with status. Age is the critical
number — a ticket that has been sitting for 22 minutes needs to be visually unmissable.

Cooks advance items by tapping: `placed → fired → cooking → plated`. `expo` moves `plated → served`
at the pass.

The **86 board** sits alongside the lanes, showing dishes that are out or about to be — sourced from the
same runway data as [runway-board.md](runway-board.md), condensed.

Designed for the environment, not the demo: no mouse, no hover, no small text, no drag-and-drop. Tap
targets sized for a cook with busy hands, type legible from ~2 m through glare on a grease-filmed
screen. See the density split in [../04-design-system.md](../04-design-system.md).

## Screens

`/ops/kds` (all stations, expo view) · `/ops/kds?station=grill` (single station, what a `chef` lands on)

## Data

- **Reads** `order_items` + `orders` + `dishes` + `tables` for the current service; `dish_availability`
  for the 86 board
- **Writes** `order_items.status`, `fired_at`, `plated_at`, `served_at`

## API

```
PATCH /api/order-items/[id]/status
  body: { status: 'fired' | 'cooking' | 'plated' | 'served' | 'voided' }
  → 200 | 403 (wrong role/station) | 409 (illegal transition)
```

## Realtime

Subscribes to `restaurant:{id}:kds` for new dockets and status changes from other stations. Publishes
status changes onward to `order:{id}` so the guest's rail advances.

## Rules & edge cases

- **Transitions are validated server-side.** `placed → served` skipping the middle is rejected with 409.
  A cook's fat-finger must not silently mark food served that was never cooked.
- **Role gates the transition:** `chef` can do `fired`/`cooking`/`plated` on their own station only;
  `expo` owns `plated → served`; `manager`/`owner` can void.
- **Ticket age escalates visually** at thresholds (e.g. 10 / 20 min). Encoded redundantly — colour *and*
  position *and* label — because colour alone fails on that screen for that person.
- **Multi-station orders:** one order's items appear in several lanes. Expo needs to see when all
  stations have plated, since that's when the table goes out together.
- **New docket must be noticeable without watching the screen** — this is the one place a deliberate
  motion emphasis is functional rather than decorative.
- Voiding an item returns its stock via a compensating ledger row (see [ordering.md](ordering.md)).
- Two cooks tapping the same item at once → last write wins, but the transition validator prevents an
  illegal end state.
- Screen must survive an 8-hour session without a reload: no memory leak, no subscription leak, no
  unbounded DOM growth. Completed dockets leave the board.
- Realtime drop → reconnect and refetch. A KDS showing stale tickets is actively dangerous.

## Verification

- Place an order from a phone → docket appears in the correct station lane within ~1s
- `grill@brigade.test` sees only grill items
- Advancing status on the KDS moves the guest's tracking rail
- Illegal transition (`placed → served`) is rejected with 409
- A `chef` cannot transition another station's item (tested via the API directly)
- Ticket age crosses a threshold and the escalation is visible **and** labelled, not colour-only
- A multi-station order shows in both lanes; expo sees all-plated
- Leave the board open 30+ min with traffic: no leak, completed dockets cleared
- Legible at 2 m; every control reachable without a mouse

## Cut-line

**Never cut.** This and [runway-board.md](runway-board.md) are the demo. If time is short, cut *within*
it: the 86 board panel can move entirely to the runway board screen, and station filtering can degrade
to a single combined lane. The docket wall itself stays.
