# Staff management

**User story:** US4 (Gold) · **Status:** cut — **cut-line item 1**

_As deployed:_ Cut-line 1, as planned. Staff exist via the seed with documented logins; role changes are SQL.

**Problem it solves:** US4 lists "Staff" as one of seven dashboard examples. Roster management and shift
scheduling are what a restaurant actually needs here.

**Read this first:** this is the **first thing cut** if the build runs behind — see
[../06-roadmap.md](../06-roadmap.md). It is the least differentiated feature in the product (every
scheduling tool does it, and doing it well is a product in itself) and it demos poorly next to the KDS
and the runway board. It is documented properly so that the decision to cut it is a decision, not a
gap — and so the honest scope is legible either way.

## Behaviour

**Minimum viable version** (what actually ships if this survives):

- Staff list: name, brigade role, station assignment, active/inactive
- Invite a staff member by email with a role and station — the flow described in [auth.md](auth.md)
- Change a role or station
- Deactivate someone (revokes access; does not delete them, because their historical orders reference them)

**Explicitly out of scope**, even if the feature ships: shift scheduling, rota building, hours tracking,
labour-cost reporting, time clock, availability requests. Each is a real product. Claiming any of them
would be overclaiming.

## Screens

`/ops/staff` (list + invite) · `/ops/staff/[id]` (role, station, deactivate)

## Data

- **Reads** `profiles` for the restaurant, `orders.server_id` / `order_items` actor rollups for a light
  activity view
- **Writes** `profiles.role`, `profiles.station`, `profiles.is_active`, invite records

## API

```
POST   /api/staff/invite        { email, role, station? }   owner only
PATCH  /api/staff/[id]          { role?, station?, isActive? }
```

## Realtime

None.

## Rules & edge cases

- **`owner` only** for invites and role changes. A `manager` who could promote themselves to `owner` is a
  privilege-escalation hole.
- **Role is never accepted from client input at signup** — only from an invite. See [auth.md](auth.md).
- **Deactivate, never delete.** `orders.server_id` and `audit_log.actor_id` reference staff; deleting
  orphans history.
- **An owner cannot demote or deactivate themselves** if they're the last owner — that locks the restaurant
  out of its own account permanently.
- Changing a `chef`'s station immediately changes what their KDS shows.
- Deactivation invalidates the session on next request, not just at next login.
- Staff cannot be moved between restaurants; that's a delete-and-reinvite.

## Verification

- Owner invites a chef with a station → they accept, land on `/ops/kds?station=<theirs>`
- A `manager` cannot invite or change roles (tested via API directly, not just UI)
- An owner cannot remove their own last-owner status
- Deactivated staff lose access on the next request
- Changing a chef's station changes their KDS contents
- A deactivated staff member's historical orders still resolve their name

## Cut-line

**This is the cut.** If dropped:

- Staff exist via the seed script across all 7 roles, with documented demo logins in
  [../08-runbook.md](../08-runbook.md)
- Role changes happen by SQL, documented in the runbook
- `Status:` above flips to `cut`, and the Staff row in
  [../07-submission.md](../07-submission.md) says `cut` rather than claiming a route

Nothing else depends on this feature. The role *model* it configures is core and lives in
[../03-data-model.md](../03-data-model.md); only the management UI is optional.
