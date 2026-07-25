# Reservations & walk-in queue

**User story:** US3 (Silver) · **Status:** built

_As deployed:_ `/reserve` (guest booking + queue join) and `/ops/reservations` (read-only book). Slots generated from real service_hours in the restaurant's timezone; capacity decided in `book_table()`; the wait quote comes from real median turn times via `join_queue()`. Seating and no-show actions are not wired.

> **Fixed 2026-07-26, patch 005.** Booking was refused for **every** diner. The route decided
> capacity itself, counting `tables` where `seats >= party_size` — but `tables_read` requires
> `is_staff()`, so a diner counted zero tables, `fitting - taken <= 0` was always true, and every
> request came back "That time is fully booked." The `/reserve` page had the mirror fault: it
> counted tables it also could not see, fell back to `|| 1`, and read only the caller's own
> reservations, so it drew as available exactly the slots the API would reject.
>
> Nothing caught this for two days because the seeded book is full of reservations — written by
> the seed script with the service key. The feature looked finished *because* the data proved it
> had once worked. It took signing in as an actual diner and pressing the button, which is what
> `npm run verify:features` now does on every run.
>
> The decision moved into `book_table()`, security definer, alongside `place_order()` and
> `join_queue()` — for the same reason all three are there: **the rule depends on data the caller
> is not allowed to read, so it cannot live in the caller.** Two views, `restaurant_table_count`
> and `reservation_load`, let the page grey slots honestly without exposing who booked.

**Problem it solves:** "Long waiting times for tables." The PS asks for "smart reservations" and "queue
management" — the *smart* part being that a quoted wait should come from how long tables actually take
to turn at this restaurant, not from a host's guess.

## Behaviour

**Reservations.** A guest picks a date, time and party size at `/reserve`. Availability is checked
against table capacity already committed for that window. Confirmation goes out immediately; a reminder
follows via [notifications.md](notifications.md).

**Walk-in queue.** A guest (or host, on their behalf) joins the queue with a party size and gets a
**quoted wait** and a position. They can leave and get notified when the table is nearly ready, instead
of standing at the door.

**The quote** comes from the turn-time model:

```
median_turn(party_size_bucket)  — from historical seated→closed durations
tables_fitting(party_size)      — how many tables can take this party
ahead                           — parties queued ahead needing the same size class
quoted = median_turn × ceil(ahead / tables_fitting) + current_dwell_remaining
```

Quoted as a **range** ("20–30 min"), never a single number. A precise-looking quote that's wrong costs
more trust than a range that's right.

## Screens

`/reserve` (guest) · `/reserve/confirmed` · `/queue/[id]` (guest's live position) ·
`/ops/reservations` (host: book, seat, no-show, walk-in intake)

## Data

- **Reads** `tables`, `reservations`, `queue_entries`, historical `orders` (`opened_at`/`closed_at`) for
  turn times
- **Writes** `reservations`, `queue_entries`, `tables.status` (→ `held` on imminent booking)

## API

```
POST  /api/reservations           { partySize, requestedAt } → 201 | 409 (no capacity)
POST  /api/queue                  { partySize }              → 201 { position, quotedMinutes }
PATCH /api/reservations/[id]      { status: 'seated'|'no_show'|'cancelled' }
PATCH /api/queue/[id]             { status: 'seated'|'left' }
```

## Realtime

Subscribes to `restaurant:{id}:floor` — a table turning over changes everyone's position and quote, so
the guest's `/queue/[id]` updates live without them refreshing.

## Rules & edge cases

- **Overbooking is refused at the API.** Capacity is checked server-side against the requested window;
  the UI's date picker is convenience, not enforcement.
- **Quotes are ranges, and always caveated.** The model has no idea a party will linger over dessert.
- **Cold start:** fewer than ~10 historical turns for a party-size bucket → fall back to a configured
  default (e.g. 75 min) and don't present it as data-driven.
- **No-show grace window** before a `held` table is released — releasing instantly punishes a guest stuck
  in traffic; never releasing blocks the table all night.
- **Party size bucketing** (1–2, 3–4, 5–6, 7+) rather than exact size — a four-top and a two-top turn
  differently, but 3 vs 4 is noise.
- A guest can hold **one** active queue entry and one upcoming reservation. Prevents queue-stuffing.
- Leaving the queue is one tap and needs no explanation.
- Reservation and walk-in compete for the same tables — a `held` table is excluded from queue capacity.
- Service-hours boundaries: no booking outside `restaurants.service_hours`.

## Verification

- Book a reservation; capacity for that window decreases
- Attempt to overbook the window via the API directly → 409
- Join the queue → receive a position and a range quote
- Seat a party from the floor map → everyone behind them sees their position and quote update live
- With < 10 historical turns, the quote uses the default and says it's an estimate
- No-show past the grace window releases the `held` table
- A guest cannot hold two active queue entries
- Booking outside service hours is refused

## Cut-line

Keep the queue; it's the more interesting half and it's what "long waiting times for tables" actually
names. Degradation: **drop the turn-time model for a fixed per-party-size estimate** (documented as
such), then **drop reservations entirely** and keep walk-in queue only. Both still satisfy the US3
bullet.
