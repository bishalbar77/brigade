-- 007 — /ops/analytics took 15 seconds. The cause was RLS, evaluated per row.
--
-- FOUND BY: timing all 13 routes on the deployed site. Twelve sat between 58ms and 2.4s.
-- /ops/analytics was 15,288ms.
--
-- MEASURED, not guessed. The same query, same rows, two callers:
--
--   service key (bypasses RLS)   order_items page 1 →   399ms
--   owner's session (RLS on)     order_items page 1 → 5,997ms
--   owner's session (RLS on)     order_items page 3 → 6,335ms
--   owner's session (RLS on)     orders     page 1 → 1,083ms   (347ms as service key)
--
-- Fifteen times slower for identical output. Five pages of order_items at ~6s each is the
-- whole 15 seconds, and no amount of fetching them concurrently fixes a query that is
-- slow in the database.
--
-- WHY
-- `order_items` has two SELECT policies, and Postgres ORs them, so BOTH run for every
-- row. Each one is:
--
--   exists (select 1 from orders o where o.id = order_items.order_id
--             and o.restaurant_id = current_restaurant())
--   and is_staff()
--
-- `current_restaurant()` and `is_staff()` are STABLE, not IMMUTABLE, and they appear in a
-- per-row context — so the planner calls them once per row, per policy. Across 4,381 rows
-- that is ~8,700 correlated subqueries and ~13,000 function calls, each of which is itself
-- a `select … from profiles where id = auth.uid()`.
--
-- THE FIX
-- Wrap each call in a scalar subquery: `(select current_restaurant())`. Postgres hoists a
-- scalar subquery with no outer reference into an InitPlan — evaluated ONCE for the whole
-- statement and reused as a constant. This is the documented Supabase RLS pattern and it
-- changes no semantics whatsoever: same function, same value, same rows out. Only the
-- number of times it is called changes.
--
-- The EXISTS clauses stay, because they are the tenancy rule. They get cheap once the
-- right-hand side is a constant: `orders.id` is the primary key, so each becomes a single
-- index lookup instead of a lookup plus two function calls.
--
-- Every policy below is a verbatim restatement of the existing rule with the function
-- calls wrapped. Nothing is loosened. `sql-check` re-asserts the guarantees afterwards,
-- which is what makes a performance patch on security policies safe to ship at speed.

begin;

-- ── order_items: 4,381 rows, two SELECT policies, the whole 15 seconds ────────

drop policy if exists order_items_read_own on order_items;
create policy order_items_read_own on order_items
  for select using (
    exists (
      select 1 from orders o
       where o.id = order_items.order_id
         and o.guest_id = (select auth.uid())
    )
  );

drop policy if exists order_items_read_staff on order_items;
create policy order_items_read_staff on order_items
  for select using (
    (select is_staff())
    and exists (
      select 1 from orders o
       where o.id = order_items.order_id
         and o.restaurant_id = (select current_restaurant())
    )
  );

drop policy if exists order_items_update_staff on order_items;
create policy order_items_update_staff on order_items
  for update using (
    (select is_staff())
    and exists (
      select 1 from orders o
       where o.id = order_items.order_id
         and o.restaurant_id = (select current_restaurant())
    )
  );

-- ── orders: 904 rows, 1,083ms → the second biggest contributor ────────────────

drop policy if exists orders_read_own on orders;
create policy orders_read_own on orders
  for select using (guest_id = (select auth.uid()));

drop policy if exists orders_read_staff on orders;
create policy orders_read_staff on orders
  for select using (
    restaurant_id = (select current_restaurant()) and (select is_staff())
  );

drop policy if exists orders_write_staff on orders;
create policy orders_write_staff on orders
  for update using (
    restaurant_id = (select current_restaurant()) and (select is_staff())
  );

-- ── the other tables the ops screens read in bulk ─────────────────────────────
-- Smaller today, and each one grows with trading. stock_movements in particular is
-- append-only, so it is the table most certain to get slower on its own.

drop policy if exists stock_movements_read on stock_movements;
create policy stock_movements_read on stock_movements
  for select using (
    (select is_staff())
    and exists (
      select 1 from ingredients i
       where i.id = stock_movements.ingredient_id
         and i.restaurant_id = (select current_restaurant())
    )
  );

drop policy if exists ingredients_read on ingredients;
create policy ingredients_read on ingredients
  for select using (
    restaurant_id = (select current_restaurant()) and (select is_manager())
  );

-- patch 006 scoped this to the caller's own restaurant; same rule, hoisted.
drop policy if exists recipe_items_read on recipe_items;
create policy recipe_items_read on recipe_items
  for select using (
    (select is_staff())
    and exists (
      select 1 from dishes d
       where d.id = recipe_items.dish_id
         and d.restaurant_id = (select current_restaurant())
    )
  );

drop policy if exists tables_read on tables;
create policy tables_read on tables
  for select using (
    restaurant_id = (select current_restaurant()) and (select is_staff())
  );

drop policy if exists reservations_read_own on reservations;
create policy reservations_read_own on reservations
  for select using (guest_id = (select auth.uid()));

drop policy if exists reservations_read_staff on reservations;
create policy reservations_read_staff on reservations
  for select using (
    restaurant_id = (select current_restaurant()) and (select is_staff())
  );

drop policy if exists queue_read_own on queue_entries;
create policy queue_read_own on queue_entries
  for select using (guest_id = (select auth.uid()));

drop policy if exists queue_read_staff on queue_entries;
create policy queue_read_staff on queue_entries
  for select using (
    restaurant_id = (select current_restaurant()) and (select is_staff())
  );

-- ── indexes the policies above lean on ───────────────────────────────────────
-- The EXISTS on order_items joins to orders by primary key, which is already indexed, but
-- the FILTER is on order_items.order_id — and a per-row policy check is exactly the case
-- where its absence shows. Created if missing rather than assumed.

create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists stock_movements_ingredient_idx on stock_movements (ingredient_id);
create index if not exists orders_opened_at_idx on orders (restaurant_id, opened_at);

commit;

-- Verify — the numbers that motivated this, re-measured as the OWNER, not the service key:
--   order_items page 1   was 5,997ms
--   /ops/analytics       was 15,288ms
--
-- And confirm nothing was loosened. Every tenancy guarantee is re-asserted by
-- scripts/sql-check.sh, and scripts/verify-features.mjs re-runs the cross-role refusals
-- end to end: a cook still cannot read cost, a guest still cannot read another guest's
-- order, a chef still cannot fire another station's ticket.
