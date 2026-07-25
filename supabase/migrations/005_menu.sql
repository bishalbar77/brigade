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
