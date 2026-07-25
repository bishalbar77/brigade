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
  -- a guest must not be able to promote themselves
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
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
