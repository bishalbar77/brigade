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
