# Feature docs — index

One file per feature, all on the same template. **`Status` must match the deployed app** — see
[../07-submission.md](../07-submission.md). Update these on day 3, not optimistically.

| Feature | US | Level | Status | Cut priority |
|---|---|---|---|---|
| [auth.md](auth.md) | US2 | Silver | planned | never |
| [digital-menu.md](digital-menu.md) | US3 | Silver | planned | never |
| [ordering.md](ordering.md) | US3 | Silver | planned | never |
| [order-tracking.md](order-tracking.md) | US3 | Silver | planned | keep |
| [reservations-queue.md](reservations-queue.md) | US3 | Silver | planned | keep |
| [billing.md](billing.md) | US3 | Silver | planned | split billing = **2** |
| [kds.md](kds.md) | US4 | Gold | planned | **never — this is the demo** |
| [floor-map.md](floor-map.md) | US4 | Gold | planned | keep |
| [inventory.md](inventory.md) | US4 | Gold | planned | variance = **4** |
| [recipes.md](recipes.md) | US4 | Gold | planned | modifiers = **5** |
| [analytics.md](analytics.md) | US4+5 | Gold+ | planned | keep matrix |
| [staff.md](staff.md) | US4 | Gold | planned | **1 — first to go** |
| [runway-board.md](runway-board.md) | US5 | Platinum | planned | **never — the differentiator** |
| [demand-steering.md](demand-steering.md) | US5 | Platinum | planned | degrade to manual sort |
| [notifications.md](notifications.md) | US3+5 | Silver+ | planned | email first |

## Template

```markdown
# <Feature>
**User story:** US<n> (<level>) · **Status:** planned | built | cut
**Problem it solves:** one paragraph, tied to a PS bullet

## Behaviour           what the user can actually do, per role
## Screens             routes
## Data                tables read vs written
## API                 route handlers / RPC signatures
## Realtime            channels published & subscribed, or "none"
## Rules & edge cases  concurrency, empty states, failure states, permissions
## Verification        how to prove it works end to end
## Cut-line            what degrades gracefully if this is dropped
```

## Dependency order

Build in this order; each depends on the ones above it.

```
auth ──▶ recipes (BOM) ──▶ digital-menu ──▶ ordering ──┬──▶ order-tracking
                │                                       ├──▶ kds ──▶ floor-map ──▶ billing
                └──▶ inventory ──────────────────────────┴──▶ runway-board
                                                              ├──▶ demand-steering
                                                              ├──▶ analytics
                                                              └──▶ notifications
```

`recipes` before `digital-menu` is the non-obvious one: without a bill of materials there is no
availability to display, and availability is the whole point of the menu screen.
