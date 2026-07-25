# Notifications

**User story:** US3 + US5 (Silver + Platinum) · **Status:** cut

_As deployed:_ The `insights`/`notifications` tables and the generators exist and are tested, but nothing writes them on a schedule and no UI surfaces them. Cut honestly rather than claimed.

**Problem it solves:** "Delayed communication between customers, staff, and kitchen" on the guest side,
and "smart notifications" on the Platinum side. The *smart* part is that staff alerts are predictive —
they fire before something breaks, not after.

## Behaviour

**Guest notifications** (in-app, plus email where it matters):
- reservation confirmed, and a reminder before it
- queue: "your table is nearly ready"
- order: an item has been served, or was voided
- bill ready

**Staff notifications** — these are the interesting ones, generated from the runway engine:

| Kind | Fires when | Goes to |
|---|---|---|
| `runway_critical` | a dish enters the critical band during service | `chef` (their station), `manager` |
| `reorder` | stock ≤ reorder point | `manager`, `owner` |
| `variance` | 7-day variance below −5% | `owner` |
| `menu_dog` | a dish classes as Dog for 2+ weeks | `owner` |
| `forecast_peak` | tomorrow's forecast > 1.3× trailing mean | `manager`, `owner` |
| `ticket_age` | a docket passes the escalation threshold | `expo`, `manager` |

A bell with an unread count; a panel grouped by severity. Staff insights also land in the `insights`
table so they persist as an operational record rather than vanishing when dismissed.

**In-app + email only.** No SMS or push — both need infrastructure and approval time that three days
don't contain. Stated rather than implied.

## Screens

`/notifications` (guest) · notification panel in the ops shell · `/ops/insights` (manager, full history)

## Data

- **Reads** `notifications` for the current user; `insights` for staff surfaces
- **Writes** `notifications`, `insights`, `notifications.read_at`

## API

```
GET   /api/notifications?unread=true
PATCH /api/notifications/[id]     { read: true }
POST  /api/notifications/read-all
```

Generation happens server-side — in `place_order()`'s aftermath for availability-driven kinds, and in a
post-service job for the analytical kinds. Never generated client-side; a notification that only exists
in one open tab isn't a notification.

## Realtime

Subscribes to `notifications` filtered by `recipient_id = auth.uid()`. New rows appear without a refresh.

## Rules & edge cases

- **Deduplicate.** A dish oscillating across the critical boundary must not emit ten alerts. One per
  dish per band-transition per service, with a cooldown.
- **Don't notify what someone is already looking at.** A `chef` staring at the KDS doesn't need a toast
  telling them a docket arrived — the board already showed it.
- **RLS scopes strictly to `recipient_id`.** Notifications routinely contain operational detail; leaking
  them across users or tenants is a real breach, not a cosmetic bug.
- Severity ordering matters more than recency in the panel — a reorder alert shouldn't bury a critical
  86 warning.
- Outside service hours, suppress `runway_critical` (velocity is 0, so the band is meaningless).
- Marking read is idempotent.
- Email failures must not fail the originating transaction. A confirmation email that can't send must not
  roll back the reservation — queue it and move on.
- Copy follows the writing rules in [../04-design-system.md](../04-design-system.md): say what happened
  and what to do. Not "Alert: inventory event."

## Verification

- Drive a dish into the critical band → exactly one `runway_critical` notification to the right chef and
  the manager
- Oscillate that dish across the boundary repeatedly → no notification storm
- Drop stock below reorder point → `reorder` to manager/owner only
- A guest receives their own notifications and none belonging to anyone else (tested via REST directly)
- Unread count decrements correctly; read-all works and is idempotent
- Outside service hours no `runway_critical` fires
- A forced email-send failure leaves the reservation committed

## Cut-line

Keep the staff insight notifications — they're the visible surface of the Platinum work and cheap once
the engine exists. Degradation: **drop email entirely, in-app only** (removes the SMTP dependency, which
is also risk #1 in [../06-roadmap.md](../06-roadmap.md)), then drop guest notifications and keep staff
alerts.
