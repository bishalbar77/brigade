-- Brigade — all migrations, concatenated. GENERATED FILE, do not edit.
-- Regenerate with: npm run sql:bundle
--
-- Paste into the Supabase SQL editor and run once. Order matters: enums and
-- helper functions must exist before the policies that reference them.
--
-- Files, in order:
--   01. 001_extensions.sql
--   02. 002_enums.sql
--   03. 003_tenancy.sql
--   04. 004_inventory.sql
--   05. 005_menu.sql
--   06. 006_service.sql
--   07. 007_intelligence.sql
--   08. 008_views.sql
--   09. 009_functions.sql
--   10. 010_rls.sql
--   11. 010b_column_grants.sql
--   12. 011_realtime.sql

begin;

-- Fail fast with a readable message if this has already been applied, rather
-- than a confusing "type app_role already exists" from halfway down.
do $guard$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'restaurants') then
    raise exception 'Brigade schema is already applied — nothing to do.'
      using hint = 'To reapply from scratch: drop schema public cascade; create schema public; then re-run.';
  end if;
end
$guard$;

-- ==========================================================================
-- 001_extensions.sql
-- ==========================================================================

-- 001 — extensions
-- Run migrations in filename order. See docs/03-data-model.md.

create extension if not exists pgcrypto;

-- ==========================================================================
-- 002_enums.sql
-- ==========================================================================

-- 002 — enums
-- Enums must exist before any table or policy references them.

-- The brigade hierarchy IS the permission model. See docs/03-data-model.md.
create type app_role as enum ('owner', 'manager', 'chef', 'expo', 'server', 'host', 'guest');

create type station as enum ('grill', 'saute', 'larder', 'pastry', 'bar', 'pass');

-- Item-level, not order-level: dishes at one table finish at different times.
create type item_status as enum ('placed', 'fired', 'cooking', 'plated', 'served', 'voided');

create type order_status as enum ('open', 'paid', 'voided');

-- Every stock change carries a reason. There is no "just edit the number".
create type movement_reason as enum ('purchase', 'depletion', 'waste', 'correction', 'count');

create type table_status as enum ('open', 'seated', 'dirty', 'held');

create type reservation_status as enum ('booked', 'seated', 'no_show', 'cancelled');

create type queue_status as enum ('waiting', 'notified', 'seated', 'left');

-- ==========================================================================
-- 003_tenancy.sql
-- ==========================================================================

-- 003 — tenancy and identity
-- Multi-tenant from the first migration; retrofitting tenancy is expensive.

create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  timezone      text        not null default 'Europe/London',
  currency      text        not null default 'GBP',
  tax_rate      numeric(5,4) not null default 0.0800 check (tax_rate >= 0 and tax_rate < 1),
  -- { "mon": [["12:00","15:00"],["18:00","22:30"]], ... } — dayparts per weekday
  service_hours jsonb       not null default '{}'::jsonb,
  covers        int         not null default 0,
  created_at    timestamptz not null default now()
);

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  -- nullable: guests are global, staff belong to a restaurant
  restaurant_id uuid        references restaurants on delete set null,
  full_name     text        not null default '',
  phone         text,
  role          app_role    not null default 'guest',
  station       station,
  allergens     text[]      not null default '{}',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

create index profiles_restaurant_idx on profiles (restaurant_id) where restaurant_id is not null;

-- A profile row is created by trigger, not application code, so a user can never
-- exist without one — every RLS policy joins through profiles.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'guest');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ==========================================================================
-- 004_inventory.sql
-- ==========================================================================

-- 004 — inventory
-- Stock is an append-only ledger; ingredients.stock_qty is a projection of it (ADR-5).
-- Waste variance and the audit trail both depend on history being preserved.

create table suppliers (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants on delete cascade,
  name           text not null,
  contact        text,
  lead_time_days int  not null default 1 check (lead_time_days >= 0),
  created_at     timestamptz not null default now()
);

create table ingredients (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants on delete cascade,
  name                text not null,
  unit                text not null,                       -- kg | L | ea
  stock_qty           numeric(12,3) not null default 0,     -- projection of stock_movements
  par_level           numeric(12,3) not null default 0,
  reorder_point       numeric(12,3) not null default 0,
  cost_per_unit_cents int  not null default 0 check (cost_per_unit_cents >= 0),
  supplier_id         uuid references suppliers on delete set null,
  shelf_life_days     int,
  created_at          timestamptz not null default now(),
  unique (restaurant_id, name)
);

create index ingredients_restaurant_idx on ingredients (restaurant_id);

-- Immutable. Never updated, never deleted — a compensating row reverses a mistake.
create table stock_movements (
  id            bigserial primary key,
  ingredient_id uuid not null references ingredients on delete cascade,
  delta         numeric(12,3) not null,
  reason        movement_reason not null,
  order_item_id uuid,
  actor_id      uuid references profiles on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);

create index stock_movements_ingredient_idx on stock_movements (ingredient_id, created_at desc);
create index stock_movements_order_item_idx on stock_movements (order_item_id) where order_item_id is not null;

-- ==========================================================================
-- 005_menu.sql
-- ==========================================================================

-- 005 — menu
-- recipe_items is the bill of materials: the heart of the product.

create table menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  name          text not null,
  sort          int  not null default 0
);

create index menu_categories_restaurant_idx on menu_categories (restaurant_id);

create table dishes (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  category_id     uuid references menu_categories on delete set null,
  name            text not null,
  description     text not null default '',
  price_cents     int  not null check (price_cents >= 0),
  image_url       text,
  station         station not null default 'grill',
  prep_minutes    int  not null default 10 check (prep_minutes >= 0),
  tags            text[] not null default '{}',
  allergens       text[] not null default '{}',
  sort            int  not null default 0,
  -- manual 86 override, distinct from computed availability. Expires so an 86
  -- doesn't silently persist into tomorrow as a lost sale nobody notices.
  manual_86_until timestamptz,
  is_archived     boolean not null default false,   -- archive, never delete: order history references dishes
  created_at      timestamptz not null default now()
);

create index dishes_restaurant_idx on dishes (restaurant_id) where is_archived = false;
create index dishes_station_idx on dishes (station);

create table recipe_items (
  dish_id       uuid not null references dishes on delete cascade,
  -- NO ACTION DEFERRABLE, not RESTRICT. Both refuse to orphan a BOM by deleting an
  -- ingredient that a recipe still uses — but only NO ACTION can have that check
  -- deferred to commit time. RESTRICT is checked immediately, which made deleting a
  -- whole restaurant impossible: the cascade reaches ingredients and recipe_items by
  -- two separate paths, Postgres doesn't guarantee the order between them, and if
  -- ingredients goes first the restrict fires and the entire delete is refused.
  -- Deferring lets the cascade settle, then verifies nothing was orphaned.
  ingredient_id uuid not null references ingredients
                  on delete no action deferrable initially deferred,
  -- qty > 0 is load-bearing: zero would divide by zero in dish_availability
  qty           numeric(12,4) not null check (qty > 0),
  primary key (dish_id, ingredient_id)
);

create index recipe_items_ingredient_idx on recipe_items (ingredient_id);

create table dish_modifiers (
  id                uuid primary key default gen_random_uuid(),
  dish_id           uuid not null references dishes on delete cascade,
  name              text not null,
  price_delta_cents int  not null default 0,
  ingredient_delta  jsonb not null default '{}'::jsonb
);

-- ==========================================================================
-- 006_service.sql
-- ==========================================================================

-- 006 — service: tables, reservations, queue, orders, payments

create table tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  label         text not null,
  seats         int  not null check (seats > 0),
  zone          text not null default 'main',
  status        table_status not null default 'open',
  created_at    timestamptz not null default now(),
  unique (restaurant_id, label)
);

create index tables_restaurant_idx on tables (restaurant_id);

create table reservations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  guest_id      uuid references profiles on delete set null,
  guest_name    text not null default '',
  party_size    int  not null check (party_size > 0),
  requested_at  timestamptz not null,
  status        reservation_status not null default 'booked',
  table_id      uuid references tables on delete set null,
  source        text not null default 'web',
  created_at    timestamptz not null default now()
);

create index reservations_window_idx on reservations (restaurant_id, requested_at)
  where status in ('booked', 'seated');

create table queue_entries (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  guest_id        uuid references profiles on delete set null,
  guest_name      text not null default '',
  party_size      int  not null check (party_size > 0),
  joined_at       timestamptz not null default now(),
  quoted_minutes  int,
  status          queue_status not null default 'waiting'
);

create index queue_active_idx on queue_entries (restaurant_id, joined_at)
  where status in ('waiting', 'notified');

-- One active queue entry per guest — stops queue-stuffing.
create unique index queue_one_active_per_guest on queue_entries (guest_id)
  where guest_id is not null and status in ('waiting', 'notified');

create table orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants on delete cascade,
  table_id       uuid references tables on delete set null,
  guest_id       uuid references profiles on delete set null,
  server_id      uuid references profiles on delete set null,
  status         order_status not null default 'open',
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  subtotal_cents int not null default 0,
  tax_cents      int not null default 0,
  tip_cents      int not null default 0,
  total_cents    int not null default 0,
  -- double-tap must not create two orders
  idempotency_key text
);

create index orders_restaurant_idx on orders (restaurant_id, opened_at desc);
create index orders_guest_idx on orders (guest_id);
create unique index orders_idempotency_idx on orders (guest_id, idempotency_key)
  where idempotency_key is not null;

-- Only one open order per table: two parties on one bill is a real-world disaster.
create unique index orders_one_open_per_table on orders (table_id)
  where status = 'open' and table_id is not null;

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders on delete cascade,
  -- NO ACTION DEFERRABLE for the same reason as recipe_items.ingredient_id: still
  -- refuses to orphan a historical line by deleting a dish (archive, never delete),
  -- but deferring the check lets a whole-restaurant cascade resolve.
  dish_id          uuid not null references dishes
                     on delete no action deferrable initially deferred,
  qty              int  not null check (qty > 0),
  -- captured at order time, never re-joined to dishes.price_cents:
  -- a bill must not change because someone edited a price afterwards
  unit_price_cents int  not null check (unit_price_cents >= 0),
  status           item_status not null default 'placed',
  station          station not null,
  fired_at         timestamptz,
  plated_at        timestamptz,
  served_at        timestamptz,
  notes            text,
  modifiers        jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

create index order_items_order_idx on order_items (order_id);
create index order_items_kds_idx on order_items (station, status, created_at)
  where status in ('placed', 'fired', 'cooking', 'plated');

create table payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders on delete cascade,
  method       text not null default 'card',
  amount_cents int  not null check (amount_cents >= 0),
  status       text not null default 'succeeded',
  provider_ref text,
  created_at   timestamptz not null default now()
);

-- Idempotent payment: one succeeded payment per order.
create unique index payments_one_per_order on payments (order_id) where status = 'succeeded';

-- ==========================================================================
-- 007_intelligence.sql
-- ==========================================================================

-- 007 — intelligence
-- All deterministic. No LLM anywhere in this product (ADR-7).

-- Materialised velocity, refreshed after each service rather than computed per request.
create table dish_velocity (
  dish_id             uuid not null references dishes on delete cascade,
  weekday             int  not null check (weekday between 0 and 6),
  daypart             text not null,
  ewma_units_per_hour numeric(10,4) not null default 0,
  sample_count        int  not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (dish_id, weekday, daypart)
);

create table insights (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  kind            text not null,       -- runway_critical | reorder | variance | menu_dog | forecast_peak
  severity        int  not null default 1 check (severity between 1 and 3),
  title           text not null,
  -- title/body exist so a narration layer could be added later without touching
  -- any of the maths. That seam is intentional.
  body            text not null default '',
  payload         jsonb not null default '{}'::jsonb,
  -- The service day this insight belongs to, as an explicit business fact rather
  -- than a cast off created_at. Three reasons it's a real column:
  --   1. timestamptz::date is STABLE, not IMMUTABLE (it depends on the session
  --      TimeZone), so Postgres refuses it in an index expression.
  --   2. Restaurants carry a timezone; a UTC-pinned cast would bucket a late
  --      service onto the wrong calendar day for anywhere east or west of UTC.
  --   3. A service day is not a calendar day. A 02:00 insight belongs to the
  --      previous night's service, and only the caller knows that.
  -- The generator passes it explicitly; current_date is a sane local default.
  service_date    date not null default current_date,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);

create index insights_restaurant_idx on insights (restaurant_id, created_at desc);

-- Dedupe key: one insight per kind per subject per service day, so a dish
-- oscillating across the critical boundary can't emit a notification storm.
-- All four columns are plain or immutable-expression, so this is indexable.
-- Note: rows with a null payload->>'subject_id' are not deduped against each
-- other, since nulls don't conflict in a unique index. That's intended — kinds
-- without a subject (forecast_peak) are already one-per-day by construction.
create unique index insights_dedupe_idx on insights (
  restaurant_id, kind, (payload->>'subject_id'), service_date
) where acknowledged_at is null;

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null default '',
  deep_link    text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_idx on notifications (recipient_id, created_at desc);
create index notifications_unread_idx on notifications (recipient_id) where read_at is null;

create table audit_log (
  id         bigserial primary key,
  actor_id   uuid references profiles on delete set null,
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);

-- ==========================================================================
-- 008_views.sql
-- ==========================================================================

-- 008 — derived views
-- Availability is computed, never stored. There is no is_available column (ADR-4):
-- a stored flag must be kept in sync by every code path that touches stock, and one
-- missed path means the menu lies to a guest. A view cannot drift.

create view dish_availability as
select
  d.id            as dish_id,
  d.restaurant_id,
  -- left join + coalesce: a dish with no BOM entered is UNLIMITED, not unavailable.
  -- An inner join would silently hide every dish whose recipe hasn't been entered yet,
  -- making a half-configured menu look like a closed kitchen.
  coalesce(min(floor(i.stock_qty / nullif(ri.qty, 0)))::int, 2147483647) as portions,
  -- a manual 86 wins over computed availability, but stays distinguishable from it
  (d.manual_86_until is not null and d.manual_86_until > now()) as manually_86,
  count(ri.ingredient_id) = 0 as unlimited
from dishes d
left join recipe_items ri on ri.dish_id = d.id
left join ingredients  i  on i.id = ri.ingredient_id
where d.is_archived = false
group by d.id, d.restaurant_id, d.manual_86_until;

comment on view dish_availability is
  'Portions available per dish, from the recipe BOM against live stock. The binding ingredient decides: six steaks and one lemon means one steak dish.';

-- sql-lint flags this view for running as owner with no tenancy filter. Intentional:
-- a guest must read portions with no account at all, and an anonymous caller has
-- current_restaurant() = null, so a filter would return nothing and delete the
-- product's central feature. It exposes only dish_id + portions for dishes that are
-- already publicly readable — no stock levels, no ingredient names, no cost.

-- Which ingredient is the constraint. "Branzino 86s at 20:40" is information;
-- "because you have 4 lemons" is something a chef can act on in five minutes.
create view dish_binding_ingredient as
select distinct on (d.id)
  d.id as dish_id,
  i.id as ingredient_id,
  i.name as ingredient_name,
  i.stock_qty,
  ri.qty as qty_per_portion,
  floor(i.stock_qty / nullif(ri.qty, 0))::int as portions_from_this
from dishes d
join recipe_items ri on ri.dish_id = d.id
join ingredients  i  on i.id = ri.ingredient_id
where d.is_archived = false
order by d.id, floor(i.stock_qty / nullif(ri.qty, 0)) asc, i.name asc;

-- ==========================================================================
-- 009_functions.sql
-- ==========================================================================

-- 009 — functions
-- place_order() is the correctness centrepiece. See docs/features/ordering.md.

-- ---------------------------------------------------------------------------
-- RLS helpers. security definer so policies can read profiles without recursing
-- through profiles' own RLS.
-- ---------------------------------------------------------------------------

create function current_restaurant() returns uuid
language sql stable security definer set search_path = public as $$
  select restaurant_id from profiles where id = auth.uid()
$$;

create function current_role_of() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) <> 'guest',
    false)
$$;

create function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) in ('owner', 'manager'),
    false)
$$;

-- ---------------------------------------------------------------------------
-- adjust_stock — the ONLY sanctioned way to change stock besides place_order().
-- Never a bare UPDATE ingredients SET stock_qty: the ledger and the projection
-- must stay in agreement (ADR-5).
-- ---------------------------------------------------------------------------

create function adjust_stock(
  p_ingredient_id uuid,
  p_delta         numeric,
  p_reason        movement_reason,
  p_note          text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_new_qty numeric;
begin
  if not is_manager() then
    raise exception 'FORBIDDEN' using detail = 'stock adjustment requires manager or owner';
  end if;

  insert into stock_movements (ingredient_id, delta, reason, actor_id, note)
  values (p_ingredient_id, p_delta, p_reason, auth.uid(), p_note);

  update ingredients
     set stock_qty = stock_qty + p_delta
   where id = p_ingredient_id
  returning stock_qty into v_new_qty;

  return v_new_qty;
end;
$$;

-- Records a physical count as a CORRECTION for the difference, rather than
-- overwriting the balance. The gap between counted and expected IS the variance
-- signal — overwriting destroys the data waste analysis needs.
create function record_count(p_ingredient_id uuid, p_counted_qty numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_expected numeric;
begin
  if not is_manager() then
    raise exception 'FORBIDDEN';
  end if;

  select stock_qty into v_expected from ingredients where id = p_ingredient_id;
  if v_expected is null then
    raise exception 'NOT_FOUND';
  end if;

  return adjust_stock(
    p_ingredient_id,
    p_counted_qty - v_expected,
    'count',
    format('counted %s, expected %s', p_counted_qty, v_expected)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- place_order — atomic. Two guests must not both be sold the last portion.
--
-- p_items: [{ "dish_id": uuid, "qty": int, "notes": text }]
-- ---------------------------------------------------------------------------

create function place_order(
  p_restaurant_id   uuid,
  p_table_id        uuid,
  p_items           jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guest      uuid := auth.uid();
  v_order_id   uuid;
  v_lock       record;
  v_short      record;
  v_item       record;
  v_subtotal   int := 0;
  v_tax_rate   numeric;
  v_tax        int;
  v_item_id    uuid;
  v_existing   uuid;
begin
  if v_guest is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Verified email is enforced HERE, not only in the UI.
  if not exists (
    select 1 from auth.users
     where id = v_guest and email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_NOT_VERIFIED'
      using detail = 'verify your email address before ordering';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  -- Double-tap protection: return the existing order rather than creating a second.
  if p_idempotency_key is not null then
    select id into v_existing from orders
     where guest_id = v_guest and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  ------------------------------------------------------------------
  -- 1. Lock every implicated ingredient row, ORDERED BY id.
  --
  -- The ordering is not cosmetic. Two concurrent orders touching an
  -- overlapping ingredient set will DEADLOCK if they acquire locks in
  -- different sequences. Sorting makes acquisition order consistent.
  ------------------------------------------------------------------
  for v_lock in
    select i.id
      from ingredients i
     where i.id in (
       select ri.ingredient_id
         from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
         join recipe_items ri on ri.dish_id = x.dish_id
     )
     order by i.id
       for update
  loop
    null;  -- the lock is the point
  end loop;

  ------------------------------------------------------------------
  -- 2. Re-check availability INSIDE the transaction, against the locked rows.
  --
  -- Demand is aggregated PER INGREDIENT across the whole order, not per dish.
  -- Two different dishes sharing the last 3 lemons would each pass an
  -- independent check and collectively oversell.
  ------------------------------------------------------------------
  select i.name, i.stock_qty, agg.required
    into v_short
    from (
      select ri.ingredient_id, sum(ri.qty * x.qty) as required
        from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
        join recipe_items ri on ri.dish_id = x.dish_id
       group by ri.ingredient_id
    ) agg
    join ingredients i on i.id = agg.ingredient_id
   where agg.required > i.stock_qty
   order by (agg.required - i.stock_qty) desc
   limit 1;

  if v_short is not null then
    -- Report the affected DISH and its real remaining portions. The guest is never
    -- told which ingredient is short — that's staff information.
    declare
      v_dish_name text;
      v_portions  int;
    begin
      select d.name, av.portions
        into v_dish_name, v_portions
        from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
        join dishes d on d.id = x.dish_id
        join dish_availability av on av.dish_id = d.id
       where x.qty > av.portions
       order by av.portions asc
       limit 1;

      raise exception 'INSUFFICIENT_STOCK'
        using detail = coalesce(v_dish_name, 'an item') || '|' || coalesce(v_portions, 0)::text;
    end;
  end if;

  -- Manual 86 also blocks ordering.
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
      join dishes d on d.id = x.dish_id
     where d.manual_86_until is not null and d.manual_86_until > now()
  ) then
    raise exception 'INSUFFICIENT_STOCK' using detail = 'that dish|0';
  end if;

  ------------------------------------------------------------------
  -- 3. Create the order
  ------------------------------------------------------------------
  insert into orders (restaurant_id, table_id, guest_id, status, idempotency_key)
  values (p_restaurant_id, p_table_id, v_guest, 'open', p_idempotency_key)
  returning id into v_order_id;

  ------------------------------------------------------------------
  -- 4. Items at prices captured NOW, + 5. ledger depletion, + 6. projection
  ------------------------------------------------------------------
  for v_item in
    select x.dish_id, x.qty, x.notes, d.price_cents, d.station
      from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int, notes text)
      join dishes d on d.id = x.dish_id
  loop
    insert into order_items (order_id, dish_id, qty, unit_price_cents, station, notes)
    values (v_order_id, v_item.dish_id, v_item.qty, v_item.price_cents, v_item.station, v_item.notes)
    returning id into v_item_id;

    v_subtotal := v_subtotal + (v_item.price_cents * v_item.qty);

    insert into stock_movements (ingredient_id, delta, reason, order_item_id, actor_id)
    select ri.ingredient_id, -(ri.qty * v_item.qty), 'depletion', v_item_id, v_guest
      from recipe_items ri
     where ri.dish_id = v_item.dish_id;

    update ingredients i
       set stock_qty = i.stock_qty - (ri.qty * v_item.qty)
      from recipe_items ri
     where ri.dish_id = v_item.dish_id and i.id = ri.ingredient_id;
  end loop;

  ------------------------------------------------------------------
  -- 7. Totals. Integer cents; rounded ONCE on the total, never per line.
  ------------------------------------------------------------------
  select tax_rate into v_tax_rate from restaurants where id = p_restaurant_id;
  v_tax := round(v_subtotal * coalesce(v_tax_rate, 0));

  update orders
     set subtotal_cents = v_subtotal,
         tax_cents      = v_tax,
         total_cents    = v_subtotal + v_tax
   where id = v_order_id;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- void_order_item — reverses stock with a COMPENSATING ledger row.
-- The original depletion row is never deleted; the ledger is append-only.
-- ---------------------------------------------------------------------------

create function void_order_item(p_item_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  select oi.*, o.restaurant_id into v_item
    from order_items oi join orders o on o.id = oi.order_id
   where oi.id = p_item_id;

  if v_item is null then raise exception 'NOT_FOUND'; end if;
  if v_item.status = 'voided' then return; end if;

  insert into stock_movements (ingredient_id, delta, reason, order_item_id, actor_id, note)
  select ri.ingredient_id, (ri.qty * v_item.qty), 'correction', p_item_id, auth.uid(),
         coalesce(p_reason, 'item voided')
    from recipe_items ri
   where ri.dish_id = v_item.dish_id;

  update ingredients i
     set stock_qty = i.stock_qty + (ri.qty * v_item.qty)
    from recipe_items ri
   where ri.dish_id = v_item.dish_id and i.id = ri.ingredient_id;

  update order_items set status = 'voided' where id = p_item_id;

  -- recompute the bill from the surviving items
  update orders o
     set subtotal_cents = sub.st,
         tax_cents      = round(sub.st * r.tax_rate),
         total_cents    = sub.st + round(sub.st * r.tax_rate)
    from (
      select order_id, coalesce(sum(unit_price_cents * qty), 0)::int as st
        from order_items
       where order_id = v_item.order_id and status <> 'voided'
       group by order_id
    ) sub,
    restaurants r
   where o.id = v_item.order_id and sub.order_id = o.id and r.id = o.restaurant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- advance_item_status — transitions validated server-side.
-- A cook's fat-finger must not mark food served that was never cooked.
-- ---------------------------------------------------------------------------

create function advance_item_status(p_item_id uuid, p_to item_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from item_status;
  v_role app_role := current_role_of();
  v_ok   boolean := false;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_from from order_items where id = p_item_id;
  if v_from is null then raise exception 'NOT_FOUND'; end if;

  -- Legal transitions only. Written as explicit comparisons rather than a row
  -- constructor IN list, so the enum literals coerce unambiguously.
  v_ok := (v_from = 'placed'  and p_to = 'fired')
       or (v_from = 'fired'   and p_to = 'cooking')
       or (v_from = 'cooking' and p_to = 'plated')
       or (v_from = 'plated'  and p_to = 'served');

  if not v_ok then
    raise exception 'ILLEGAL_TRANSITION'
      using detail = format('%s -> %s', v_from, p_to);
  end if;

  -- expo owns the pass
  if p_to = 'served' and v_role not in ('expo', 'server', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using detail = 'plated -> served belongs to expo';
  end if;

  update order_items
     set status   = p_to,
         fired_at  = case when p_to = 'fired'  then now() else fired_at  end,
         plated_at = case when p_to = 'plated' then now() else plated_at end,
         served_at = case when p_to = 'served' then now() else served_at end
   where id = p_item_id;
end;
$$;

-- ==========================================================================
-- 010_rls.sql
-- ==========================================================================

-- 010 — row level security
-- Authorization lives HERE, not in UI conditionals (ADR-3). Hiding a button is
-- presentation; the database refusing the row is security. In a multi-tenant app a
-- missed `where restaurant_id = ?` in application code is a cross-tenant leak — the
-- same mistake with RLS on returns zero rows.

alter table restaurants     enable row level security;
alter table profiles        enable row level security;
alter table suppliers       enable row level security;
alter table ingredients     enable row level security;
alter table stock_movements enable row level security;
alter table menu_categories enable row level security;
alter table dishes          enable row level security;
alter table recipe_items    enable row level security;
alter table dish_modifiers  enable row level security;
alter table tables          enable row level security;
alter table reservations    enable row level security;
alter table queue_entries   enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table payments        enable row level security;
alter table dish_velocity   enable row level security;
alter table insights        enable row level security;
alter table notifications   enable row level security;
alter table audit_log       enable row level security;

-- ---------------- tenancy ----------------

create policy restaurants_read on restaurants
  for select using (true);                        -- public: needed to render a menu
create policy restaurants_write on restaurants
  for update using (id = current_restaurant() and current_role_of() = 'owner');

create policy profiles_read_self on profiles
  for select using (id = auth.uid());
create policy profiles_read_colleagues on profiles
  for select using (restaurant_id is not null and restaurant_id = current_restaurant() and is_staff());
create policy profiles_update_self on profiles
  for update using (id = auth.uid())
  -- A guest must not be able to promote themselves: the new role must equal the
  -- existing one. current_role_of() rather than an inline `select ... from profiles`,
  -- because a policy on profiles that queries profiles risks
  -- "infinite recursion detected in policy for relation profiles". The helper is
  -- security definer, so it bypasses RLS and cannot recurse.
  with check (id = auth.uid() and role = current_role_of());
create policy profiles_admin on profiles
  for update using (restaurant_id = current_restaurant() and current_role_of() = 'owner');

-- ---------------- menu: public read, manager write ----------------

create policy menu_categories_read on menu_categories for select using (true);
create policy menu_categories_write on menu_categories
  for all using (restaurant_id = current_restaurant() and is_manager());

create policy dishes_read on dishes for select using (true);
create policy dishes_write on dishes
  for all using (restaurant_id = current_restaurant() and is_manager());

-- recipe_items is readable so the guest UI can show ingredient NAMES.
-- Quantities are exposed here; costs are NOT (they live on ingredients).
create policy recipe_items_read on recipe_items for select using (true);
create policy recipe_items_write on recipe_items
  for all using (
    exists (select 1 from dishes d
             where d.id = recipe_items.dish_id
               and d.restaurant_id = current_restaurant())
    and is_manager()
  );

create policy dish_modifiers_read on dish_modifiers for select using (true);
create policy dish_modifiers_write on dish_modifiers
  for all using (
    exists (select 1 from dishes d
             where d.id = dish_modifiers.dish_id
               and d.restaurant_id = current_restaurant())
    and is_manager()
  );

-- ---------------- inventory: staff read, manager write ----------------
-- NOTE: ingredients carries cost_per_unit_cents. Column-level grants in 010b below
-- keep costs away from non-managers even on an accidental `select *`.

create policy ingredients_read on ingredients
  for select using (restaurant_id = current_restaurant() and is_staff());
create policy ingredients_write on ingredients
  for all using (restaurant_id = current_restaurant() and is_manager());

create policy suppliers_rw on suppliers
  for all using (restaurant_id = current_restaurant() and is_manager());

create policy stock_movements_read on stock_movements
  for select using (
    exists (select 1 from ingredients i
             where i.id = stock_movements.ingredient_id
               and i.restaurant_id = current_restaurant())
    and is_staff()
  );
-- no insert/update/delete policy: writes go through adjust_stock() / place_order() only

-- ---------------- service ----------------

create policy tables_read on tables
  for select using (restaurant_id = current_restaurant() and is_staff());
create policy tables_write on tables
  for all using (
    restaurant_id = current_restaurant()
    and current_role_of() in ('owner','manager','host','server')
  );

create policy reservations_read_own on reservations
  for select using (guest_id = auth.uid());
create policy reservations_read_staff on reservations
  for select using (restaurant_id = current_restaurant() and is_staff());
create policy reservations_insert_own on reservations
  for insert with check (guest_id = auth.uid());
create policy reservations_write_staff on reservations
  for update using (
    restaurant_id = current_restaurant()
    and current_role_of() in ('owner','manager','host')
  );

create policy queue_read_own on queue_entries
  for select using (guest_id = auth.uid());
create policy queue_read_staff on queue_entries
  for select using (restaurant_id = current_restaurant() and is_staff());
create policy queue_insert_own on queue_entries
  for insert with check (guest_id = auth.uid());
create policy queue_write_staff on queue_entries
  for update using (
    restaurant_id = current_restaurant()
    and current_role_of() in ('owner','manager','host')
  );

-- orders: a guest sees only their own; staff see their restaurant's.
create policy orders_read_own on orders
  for select using (guest_id = auth.uid());
create policy orders_read_staff on orders
  for select using (restaurant_id = current_restaurant() and is_staff());
create policy orders_write_staff on orders
  for update using (restaurant_id = current_restaurant() and is_staff());
-- guests never INSERT directly: place_order() is the only path in.

create policy order_items_read_own on order_items
  for select using (
    exists (select 1 from orders o
             where o.id = order_items.order_id and o.guest_id = auth.uid())
  );
create policy order_items_read_staff on order_items
  for select using (
    exists (select 1 from orders o
             where o.id = order_items.order_id and o.restaurant_id = current_restaurant())
    and is_staff()
  );
create policy order_items_update_staff on order_items
  for update using (
    exists (select 1 from orders o
             where o.id = order_items.order_id and o.restaurant_id = current_restaurant())
    and is_staff()
  );

create policy payments_read_own on payments
  for select using (
    exists (select 1 from orders o
             where o.id = payments.order_id and o.guest_id = auth.uid())
  );
create policy payments_read_staff on payments
  for select using (
    exists (select 1 from orders o
             where o.id = payments.order_id and o.restaurant_id = current_restaurant())
    and is_staff()
  );
create policy payments_insert on payments
  for insert with check (
    exists (select 1 from orders o
             where o.id = payments.order_id
               and (o.guest_id = auth.uid()
                    or (o.restaurant_id = current_restaurant() and is_staff())))
  );

-- ---------------- intelligence: manager and owner only ----------------

create policy dish_velocity_read on dish_velocity
  for select using (
    exists (select 1 from dishes d
             where d.id = dish_velocity.dish_id
               and d.restaurant_id = current_restaurant())
    and is_staff()
  );

create policy insights_read on insights
  for select using (restaurant_id = current_restaurant() and is_staff());
create policy insights_ack on insights
  for update using (restaurant_id = current_restaurant() and is_staff());

create policy notifications_read_own on notifications
  for select using (recipient_id = auth.uid());
create policy notifications_update_own on notifications
  for update using (recipient_id = auth.uid());

create policy audit_log_read on audit_log
  for select using (is_manager());

-- ==========================================================================
-- 010b_column_grants.sql
-- ==========================================================================

-- 010b — column-level protection for cost data
--
-- Row policies decide WHICH rows you see. They do not stop a `select *` from
-- returning a column you shouldn't have. cost_per_unit_cents must never reach a
-- guest or a non-manager staff payload, so it is protected at the column level too.
--
-- Implemented as a safe view + revoked direct access rather than per-column grants,
-- because Supabase's REST layer exposes tables directly and a column grant alone
-- still lets PostgREST advertise the column.

-- A cost-free projection of ingredients, safe for chefs / expo / servers.
create view ingredients_public
with (security_invoker = true)
as
select
  id, restaurant_id, name, unit, stock_qty, par_level, reorder_point,
  supplier_id, shelf_life_days, created_at
from ingredients;

comment on view ingredients_public is
  'Ingredients without cost_per_unit_cents. Non-manager staff surfaces must read this, never the base table.';

-- Guest-facing menu projection: dish fields + availability, no cost, no margin.
create view menu_public
with (security_invoker = true)
as
select
  d.id, d.restaurant_id, d.category_id, d.name, d.description,
  d.price_cents, d.image_url, d.station, d.prep_minutes,
  d.tags, d.allergens, d.sort,
  av.portions,
  av.manually_86,
  av.unlimited
from dishes d
join dish_availability av on av.dish_id = d.id
where d.is_archived = false;

comment on view menu_public is
  'What a guest is allowed to see. Never expose dishes joined to ingredients.cost_per_unit_cents.';

-- ==========================================================================
-- 011_realtime.sql
-- ==========================================================================

-- 011 — realtime publication
-- One channel per surface, unsubscribed on unmount. Free-tier connection limits
-- are real: a subscription leak on navigation kills realtime for everyone.
--
-- Channels (see docs/02-architecture.md):
--   restaurant:{id}:kds           order_items      → KDS, expo
--   restaurant:{id}:floor         tables, orders   → floor map, host
--   restaurant:{id}:availability  ingredients      → guest menus, runway board
--   order:{id}                    order_items      → that guest's tracking screen
--
-- Written defensively rather than as bare `alter publication ... add table`,
-- because how Supabase provisions supabase_realtime varies: if it were created
-- FOR ALL TABLES, an explicit add errors out and takes the whole migration with it.

do $$
declare
  v_all_tables boolean;
  v_tbl        text;
begin
  select puballtables into v_all_tables
    from pg_publication
   where pubname = 'supabase_realtime';

  if v_all_tables is null then
    -- unusual on Supabase, but harmless to create
    execute 'create publication supabase_realtime';
    v_all_tables := false;
  end if;

  if v_all_tables then
    raise notice 'supabase_realtime is FOR ALL TABLES — every table is already published';
    return;
  end if;

  for v_tbl in
    select unnest(array[
      'order_items', 'orders', 'tables', 'queue_entries', 'notifications', 'ingredients'
    ])
  loop
    if not exists (
      select 1
        from pg_publication_rel pr
        join pg_publication p on p.oid = pr.prpubid
        join pg_class       c on c.oid = pr.prrelid
       where p.pubname = 'supabase_realtime'
         and c.relname = v_tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tbl);
    end if;
  end loop;
end
$$;

-- REPLICA IDENTITY FULL so update payloads carry the previous row too — needed to
-- tell "crossed into the critical band" from "was already critical", which is what
-- prevents a notification storm.
alter table order_items   replica identity full;
alter table ingredients   replica identity full;
alter table tables        replica identity full;
alter table queue_entries replica identity full;

commit;
