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
  dish_id          uuid not null references dishes on delete restrict,
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
