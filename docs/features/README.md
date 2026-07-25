# Feature docs — index

One file per feature, all on the same template. **`Status` matches the deployed app** — reconciled
against the live routes after an adversarial audit, not filled in optimistically. Each doc also carries
an `_As deployed:_` line stating what actually shipped versus what the doc originally planned.

| Feature | US | Level | Status | Cut priority |
|---|---|---|---|---|
| [auth.md](auth.md) | US2 | Silver | built | never |
| [digital-menu.md](digital-menu.md) | US3 | Silver | built | never |
| [ordering.md](ordering.md) | US3 | Silver | built | never |
| [order-tracking.md](order-tracking.md) | US3 | Silver | built | keep |
| [reservations-queue.md](reservations-queue.md) | US3 | Silver | built | keep |
| [billing.md](billing.md) | US3 | Silver | built | split billing = **2** |
| [kds.md](kds.md) | US4 | Gold | built | **never — this is the demo** |
| [floor-map.md](floor-map.md) | US4 | Gold | built (read-only) | keep |
| [inventory.md](inventory.md) | US4 | Gold | built (read-only) | variance = **4** |
| [recipes.md](recipes.md) | US4 | Gold | built (read-only) | modifiers = **5** |
| [analytics.md](analytics.md) | US4+5 | Gold+ | built | keep matrix |
| [staff.md](staff.md) | US4 | Gold | cut | **1 — first to go** |
| [runway-board.md](runway-board.md) | US5 | Platinum | built | **never — the differentiator** |
| [demand-steering.md](demand-steering.md) | US5 | Platinum | built (partial) | degrade to manual sort |
| [notifications.md](notifications.md) | US3+5 | Silver+ | cut | email first |

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
