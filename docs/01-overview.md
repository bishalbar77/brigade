# 01 — Overview

## The brief

VibeAthon 6.0, 25–27 July 2026, solo, 3 days. Build and deploy a full-stack SaaS platform that
improves restaurant operations for both customers and management. Ranking is cumulative
(Bronze → Platinum = User Stories 1 → 5).

The constraint that shaped everything: **"Do not build a clone of an existing restaurant
application."**

## Research: what already exists

Before designing, we checked what shipped POS systems already do. This mattered more than expected.

**Toast and Square already ship recipe-level ingredient depletion with automatic 86.** From Toast's
own platform docs: when a tracked ingredient hits zero, the POS marks dependent menu items
unavailable on the POS screen and on kitchen display systems, preventing servers from selling what
the kitchen can't make. Quantities decrement automatically as orders are sent to the kitchen. Sub-
recipes are shared across dishes so editing one sauce updates cost and depletion everywhere.

**So "link recipes to stock and grey out unavailable dishes" is table stakes, not innovation.**
Building only that *is* the clone the PS forbids. This finding is why the product is what it is.

### The two gaps that remain

1. **Availability is staff-facing.** Toast shows a `0` on the POS button and on the KDS. The guest at
   the table still has to ask, and the server still walks to the kitchen to check. The number is
   computed and then never shown to the person actually deciding what to order.

2. **Everything is reactive.** Existing systems tell you an item is out *after* stock hits zero.
   Nobody tells the kitchen at 18:00 "you will 86 the tandoori prawns at 20:40, you have 4 portions left" —
   and nobody uses that prediction to steer demand away from it while there is still time to act.

### Why the second gap is worth money

| Finding | Source |
|---|---|
| Restaurants waste 4–10% of all food inventory purchased | Sculpture Hospitality, 2025 |
| Food costs run 28–32% of total revenue | Sculpture Hospitality, 2025 |
| 52% of operators rank food cost as their top profitability challenge — surpassing labour for the first time since 2019 | Sculpture Hospitality, 2025 |
| Bars lose 10–20% of inventory monthly to overpouring, theft, spoilage | Apicbase |
| Operators who adopted inventory automation cut waste-related losses ~29% within six months | Apicbase |

Reactive stock management is expensive. Forecasting is where the margin is.

## The product: Brigade

**Name.** From *brigade de cuisine*, Escoffier's station system — the original answer to "how does a
kitchen coordinate under pressure." The name does structural work rather than just sounding good:
the brigade **is** a hierarchy of stations, which is exactly how the KDS partitions tickets and
exactly how role-based access is shaped (see [03-data-model.md](03-data-model.md)). It also names the
PS challenge bullet "inefficient staff coordination" directly.

**Thesis.** A printed menu is a promise the kitchen may not be able to keep. Brigade makes the menu a
live function of the pantry, forecasts when each dish will run out, and reshapes what guests see so
the kitchen only receives orders it can actually fill — profitably.

### The mechanism: runway

Every dish carries a **runway** — minutes until it 86s at tonight's actual sell rate. One number,
derived from the recipe BOM and live sales velocity. It drives four surfaces at once:

| Surface | What runway does there |
|---|---|
| Guest menu | Shows "6 left." Near-86 dishes are demoted out of the browse rail and badged, so guests aren't disappointed by ordering something about to vanish |
| Kitchen (KDS) | The 86 board becomes a **countdown**, not an obituary: "tandoori prawns 86s ~20:40 · 4 portions" |
| Manager | Reorder quantities and prep lists fall out of the same velocity model |
| Revenue | Demand steering favours high-margin dishes with long runway — the constraint becomes a lever |

One coherent idea reaching every user-story level, instead of six bolted-on features. And it is the
honest answer to "don't clone": **Toast computes availability; Brigade computes time remaining and
acts on it.**

## Personas

**Priya — diner, 28.** Seated, hungry, phone in one hand, restaurant is dim and loud. Wants to decide
fast and not be told "sorry, that's finished" after ordering. Does not know or care what "expo" means.
Success = ordered confidently in under 90 seconds.

**Rahul — chef de partie on grill, 34.** Standing, hot, hands busy, reading a wall-mounted screen from
about two metres. Needs ticket state at a glance and to know what's about to run out *before* it does.
Cannot use a mouse. Colour alone is not readable to him on a grease-filmed screen.

**Meera — owner / chef de cuisine, 41.** Desktop, end of service or next morning. Wants to know what
lost money, what to order tomorrow, and where stock is walking out the door. Judges the product on
whether it reduces the number of things she has to remember.

## What "solved" looks like against the PS challenge list

| PS challenge | How Brigade addresses it |
|---|---|
| Customers waiting to know whether dishes are available | Computed availability shown live on the guest menu — "6 left" |
| Limited visibility into menu items and services | Digital menu with allergens, ingredients, prep time |
| Long waiting times for tables and orders | Reservations + walk-in queue with quoted wait from real turn times |
| Delayed communication between customers, staff, kitchen | One realtime order object; guest, server and kitchen subscribe to the same state |
| Manual order, billing, inventory management | Orders deplete stock atomically; billing derived from order items |
| Inefficient staff coordination | Station-partitioned KDS + the brigade role model |
| Lack of operational insights and analytics | Menu-engineering matrix, waste variance, demand forecast |

## Sources

- [Toast — menu item inventory overview](https://doc.toasttab.com/doc/platformguide/adminMenuItemInventoryOverview.html)
- [Rezku — what "86" means in a restaurant](https://rezku.com/blog/what-does-86-mean-in-a-restaurant/)
- [Sculpture Hospitality — restaurant industry statistics 2025](https://www.sculpturehospitality.com/blog/restaurant-industry-statistics-2025)
- [Apicbase — restaurant inventory statistics](https://get.apicbase.com/restaurant-inventory-statistics/)
