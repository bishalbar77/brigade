# Floor map

**User story:** US4 (Gold) · **Status:** built (read-only)

_As deployed:_ `/ops/floor`. Real table states and dwell time; manual seating and bussing actions are not wired.

> **Fixed 2026-07-26, patch 004.** A table with food on it showed as free. `pay_order()`
> correctly released a settled table to `dirty` so it would be bussed rather than re-seated, but
> nothing ever set the other end of that transition — ordering at table 10 left it `open`. Only
> the seed script had ever written `seated`, which is why every screenshot looked right and the
> live behaviour did not. Now a trigger on `orders`: any order attached to a table means that
> table is occupied, however the order got there, so the rule belongs to the table rather than to
> one function that happens to insert into it. `dirty` is deliberately left alone — a table that
> needs a clean still needs one, and clearing that flag because an order arrived would destroy
> the only signal the busser has.

**Problem it solves:** "Inefficient staff coordination" and part of "long waiting times for tables." A
host seating a party needs to know what's actually free right now, and a server needs to see their own
section without reading the whole room.

## Behaviour

A spatial view of tables by zone, each showing status, party size, server, and — for seated tables —
how long they've been there and where their order has got to.

| Status | Meaning |
|---|---|
| `open` | ready to seat |
| `seated` | party present, order open |
| `dirty` | needs bussing before it can be seated |
| `held` | reserved for an imminent booking |

A `server` sees the room but only acts on their own tables. A `host` seats parties from the queue or a
reservation. A `manager` can reassign anything.

Table dwell time feeds the turn-time model that produces queue wait quotes — see
[reservations-queue.md](reservations-queue.md).

## Screens

`/ops/floor`

## Data

- **Reads** `tables`, `orders` (open ones), `order_items` status rollup, `profiles` (server names),
  `reservations` (for `held`)
- **Writes** `tables.status`, `tables` ↔ `orders` assignment, `orders.server_id`

## API

```
PATCH /api/tables/[id]        { status, serverId? }
POST  /api/tables/[id]/seat   { queueEntryId | reservationId, partySize }
```

## Realtime

Subscribes to `restaurant:{id}:floor` — table status and order changes. Another server bussing a table
updates this screen immediately.

## Rules & edge cases

- **Seating a table with an open order is rejected.** Two parties on one bill is a real-world disaster
  and the API refuses it rather than trusting the UI to prevent it.
- `dirty → open` is an explicit action, not automatic on payment. Someone has to actually clear it.
- Closing a bill moves the table to `dirty`, never straight to `open`.
- A `server` cannot reassign another server's table; `manager`/`owner` can.
- `held` expires if the reservation is a no-show past its grace window, releasing the table rather than
  leaving it blocked all night.
- Zones render as a **layout, not a literal floor plan** — real coordinates are more work than they're
  worth here, and a grouped grid reads faster anyway. Stated so it doesn't look like an omission.
- Party size larger than table seats → warning, but allowed. Restaurants pull chairs over; the system
  shouldn't be more rigid than the room.

## Verification

- Seat a party from the queue → table goes `seated`, order opens, queue entry closes
- Attempt to seat an already-occupied table → refused by the API, not just hidden in the UI
- Close a bill → table becomes `dirty`; explicit bussing action makes it `open`
- Two browsers: one bussing a table updates the other within ~1s
- A `server` cannot reassign a table they don't own (tested via API)
- A no-show reservation releases its `held` table after the grace window
- Readable at 375 px (a host may be on a tablet or phone)

## Cut-line

Keep — it's the connective tissue between queue, ordering, and billing. Degradation: **drop zone
grouping** for a flat list of tables, and **drop server assignment** so any staff member can act on any
table. Status tracking itself stays, because billing and the queue both depend on it.
