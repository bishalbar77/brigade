# 03 — Data model

Multi-tenant from the first migration: every domain table carries `restaurant_id`. Retrofitting
tenancy is expensive and "Scalability" is a judged criterion.

## Entity map

```
restaurants ──┬── profiles ──── (auth.users)
              ├── suppliers ──── ingredients ──┬── stock_movements
              │                                └── recipe_items ──── dishes
              ├── menu_categories ──────────────────────────────────┘
              ├── tables ──── orders ──── order_items ──── (dishes)
              │                 └──────── payments
              ├── reservations
              ├── queue_entries
              ├── dish_velocity
              ├── insights
              └── audit_log
```

## Tables

### Tenancy and identity

```sql
restaurants(
  id uuid pk, name text, slug text unique, timezone text,
  currency text, service_hours jsonb, covers int, created_at timestamptz )

profiles(
  id uuid pk references auth.users, restaurant_id uuid references restaurants,
  full_name text, phone text, role app_role not null default 'guest', created_at timestamptz )
```

`app_role` is a Postgres enum: `owner | manager | chef | expo | server | host | guest`.

### Roles — the brigade as the permission model

The hierarchy isn't invented; it's the org chart a kitchen already runs.

| DB role | Brigade term | Can see / do |
|---|---|---|
| `owner` | chef de cuisine | everything, including costs, margins, waste variance, settings |
| `manager` | sous chef | ops + inventory + analytics; no ownership settings |
| `chef` | chef de partie | KDS filtered to their station; 86 board; fire→cooking→plated |
| `expo` | the pass | all stations; plated→served |
| `server` | chef de rang | floor map, own tables, place orders, billing |
| `host` | maître d' | reservations + queue only |
| `guest` | — | own orders, own bill, the menu |

Stored values stay plain and machine-readable. **Brigade vocabulary appears in the ops UI only** —
"the pass" and "86" are what kitchen staff genuinely recognise, so they're correct there, but a diner
doesn't know what expo means, so guest surfaces use plain language.

### Inventory

```sql
suppliers(
  id uuid pk, restaurant_id uuid, name text, contact text, lead_time_days int )

ingredients(
  id uuid pk, restaurant_id uuid, name text, unit text,
  stock_qty numeric not null default 0,     -- projection of stock_movements
  par_level numeric, reorder_point numeric,
  cost_per_unit_cents int not null,
  supplier_id uuid, shelf_life_days int )

stock_movements(                             -- append-only, never updated or deleted
  id bigint pk, ingredient_id uuid, delta numeric not null,
  reason movement_reason not null,           -- purchase|depletion|waste|correction|count
  order_item_id uuid null, actor_id uuid, note text, created_at timestamptz )
```

Money is **integer cents** everywhere. Floats do not belong in money.

### Menu

```sql
menu_categories(id uuid pk, restaurant_id uuid, name text, sort int)

dishes(
  id uuid pk, restaurant_id uuid, category_id uuid,
  name text, description text, price_cents int not null, image_url text,
  station station not null,                  -- grill|saute|larder|pastry|bar|pass
  prep_minutes int, tags text[], allergens text[], is_archived bool default false )

recipe_items(                                -- the BOM. The heart of the product.
  dish_id uuid, ingredient_id uuid, qty numeric not null check (qty > 0),
  primary key (dish_id, ingredient_id) )

dish_modifiers(
  id uuid pk, dish_id uuid, name text, price_delta_cents int, ingredient_delta jsonb )
```

`check (qty > 0)` matters — a zero quantity would divide by zero in the availability view.

### Service

```sql
tables(id uuid pk, restaurant_id uuid, label text, seats int, zone text, status table_status)
  -- table_status: open|seated|dirty|held

reservations(
  id uuid pk, restaurant_id uuid, guest_id uuid, party_size int,
  requested_at timestamptz, status reservation_status, table_id uuid null,
  source text )                              -- web|walkin|phone

queue_entries(
  id uuid pk, restaurant_id uuid, guest_id uuid, party_size int,
  joined_at timestamptz, quoted_minutes int, status queue_status )

orders(
  id uuid pk, restaurant_id uuid, table_id uuid, guest_id uuid, server_id uuid,
  status order_status, opened_at timestamptz, closed_at timestamptz,
  subtotal_cents int, tax_cents int, tip_cents int, total_cents int )

order_items(
  id uuid pk, order_id uuid, dish_id uuid, qty int not null,
  unit_price_cents int not null,             -- captured at order time, never joined live
  status item_status not null default 'placed',
  fired_at timestamptz, plated_at timestamptz, served_at timestamptz,
  notes text, modifiers jsonb )

payments(id uuid pk, order_id uuid, method text, amount_cents int, status text, provider_ref text)
```

`unit_price_cents` is denormalised onto the order item on purpose: a bill must not change because
someone edited a price afterwards.

**Item status machine:** `placed → fired → cooking → plated → served`, plus `voided` from any state.
Guest sees a progress rail, kitchen sees a docket, expo works the pass.

### Intelligence

```sql
dish_velocity(                               -- materialised, refreshed after each service
  dish_id uuid, weekday int, daypart text,
  ewma_units_per_hour numeric, sample_count int, updated_at timestamptz,
  primary key (dish_id, weekday, daypart) )

insights(
  id uuid pk, restaurant_id uuid, kind text, severity int,
  title text, body text, payload jsonb,
  service_date date,                       -- see note below
  acknowledged_at timestamptz, created_at timestamptz )

notifications(
  id uuid pk, recipient_id uuid, kind text, title text, body text,
  deep_link text, read_at timestamptz, created_at timestamptz )

audit_log(
  id bigint pk, actor_id uuid, entity text, entity_id uuid, action text,
  before jsonb, after jsonb, created_at timestamptz )
```

### Why `insights.service_date` is a column, not a cast

Dedupe needs "one insight per kind per subject **per service day**", which wants an index on
the day. Three reasons that day is stored rather than derived from `created_at`:

1. **`timestamptz::date` is STABLE, not IMMUTABLE** — the result depends on the session
   `TimeZone`, so Postgres rejects it in an index expression outright.
2. **Pinning the cast to UTC would be wrong per-tenant.** Restaurants carry a `timezone`, and
   a UTC-bucketed day splits or merges a late service for anywhere east or west of UTC.
3. **A service day isn't a calendar day.** A 02:00 insight belongs to the previous night's
   service, and only the caller knows that.

The generator passes it explicitly; `current_date` is the default. Rows with a null
`payload->>'subject_id'` don't dedupe against each other — nulls never conflict in a unique
index — which is fine, because subject-less kinds (`forecast_peak`) are one-per-day already.

## Derived: `dish_availability`

```sql
create view dish_availability as
select
  d.id as dish_id,
  d.restaurant_id,
  coalesce(min(floor(i.stock_qty / nullif(ri.qty, 0)))::int, 2147483647) as portions
from dishes d
left join recipe_items ri on ri.dish_id = d.id
left join ingredients  i  on i.id = ri.ingredient_id
where d.is_archived = false
group by d.id, d.restaurant_id;
```

Three details that are easy to get wrong:

- **`left join`**, so a dish with no recipe yields `null` → `coalesce` → effectively unlimited.
  An inner join would silently hide every dish whose BOM hasn't been entered yet.
- **`nullif(ri.qty, 0)`** guards division by zero even though the check constraint should prevent it.
- **No `is_available` column exists.** Availability is computed, never stored. See ADR-4.

## `place_order()` — the atomic write

The correctness centrepiece. Two guests ordering the last portion must not both succeed.

```
place_order(p_order_id, p_items jsonb) returns order_items[]
  1. collect every ingredient_id implied by p_items via recipe_items
  2. SELECT ... FROM ingredients WHERE id = ANY(ids) ORDER BY id FOR UPDATE
     -- ORDER BY id is not cosmetic: consistent lock ordering prevents deadlock
     -- between two concurrent orders touching an overlapping ingredient set
  3. recompute availability inside the transaction from the locked rows
  4. if any requested qty > available:
         RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING detail = <dish + portions left>
  5. insert order_items
  6. insert stock_movements (reason='depletion', order_item_id set)
  7. update ingredients.stock_qty from the movements
  8. recompute affected dish_velocity lazily / notify availability channel
```

Checking availability in application code and then inserting is a race — the check and the write must
share a transaction and a lock. The typed `INSUFFICIENT_STOCK` error is what the UI turns into "that
just went — here's what's close," which is a better guest experience than a generic failure.

## RLS

Enabled on every table. Helper functions keep policies short:

```sql
create function current_restaurant() returns uuid language sql stable security definer as $$
  select restaurant_id from profiles where id = auth.uid()
$$;

create function current_role() returns app_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;
```

Policy shape per table group:

| Tables | Read | Write |
|---|---|---|
| `dishes`, `menu_categories`, `dish_availability` | anyone (public menu) | `owner`, `manager` |
| `ingredients`, `recipe_items`, `stock_movements`, `suppliers` | staff of same restaurant | `owner`, `manager` |
| `orders`, `order_items` | own rows if `guest`; same-restaurant staff otherwise | guest inserts via `place_order` RPC only; staff update status |
| `tables`, `reservations`, `queue_entries` | same-restaurant staff; guest sees own reservation | `host`, `manager`, `owner`, `server` |
| `payments` | own order if `guest`; `server`+ otherwise | `server`, `manager`, `owner` |
| `insights`, `audit_log` | `manager`, `owner` | system only |
| `notifications` | `recipient_id = auth.uid()` | system only |

Cost and margin fields are gated to `owner`/`manager` — `cost_per_unit_cents` must never reach a guest
payload. Enforced by column-level grants in addition to row policies, because a `select *` from a
staff surface would otherwise leak it.

## Migration order

Order matters; enums and helper functions must exist before the policies that reference them.

```
001_extensions            pgcrypto
002_enums                 app_role, station, item_status, order_status, movement_reason, …
003_tenancy               restaurants, profiles + trigger to create profile on signup
004_inventory             suppliers, ingredients, stock_movements
005_menu                  menu_categories, dishes, recipe_items, dish_modifiers
006_service               tables, reservations, queue_entries, orders, order_items, payments
007_intelligence          dish_velocity, insights, notifications, audit_log
008_views                 dish_availability
009_functions             current_restaurant, current_role, place_order, adjust_stock
010_rls                   enable + all policies
011_realtime              publication membership for the realtime tables
```

## Seed strategy

The seed script is **not optional scaffolding** — the entire Platinum layer is statistical, and EWMA
over an empty table forecasts nothing. Analytics built on three days of hackathon data looks broken to
a judge.

It generates roughly **six weeks of plausible history**:

- one restaurant, ~40 ingredients, ~24 dishes across 6 stations, 5 suppliers
- 12 tables across 2 zones
- staff profiles covering all 7 roles, with known demo logins
- per day: covers drawn from a weekday/weekend shape, lunch and dinner peaks
- dish mix weighted so some dishes are genuinely popular and some genuinely aren't — otherwise the
  menu-engineering matrix has nothing to say
- realistic ticket timings so `prep_minutes` and turn-time estimates are grounded
- purchases and a few waste events, so variance analysis has signal
- ends with today's stock set so that **2–3 dishes are deliberately near-86** — the runway board
  needs something to count down on camera

Written as a Node script against the service-role key, idempotent, `npm run seed`.
