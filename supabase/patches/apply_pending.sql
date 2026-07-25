-- Brigade — all pending patches, concatenated. GENERATED FILE, do not edit.
-- Regenerate with: npm run sql:bundle
--
-- Paste into the Supabase SQL editor and run. Every patch is idempotent, so
-- re-running this is safe. NOT wrapped in one transaction: each patch already
-- manages its own, and one failing patch should not roll back the others.
--
--   01. 001_fk_deferrable.sql
--   02. 002_public_velocity.sql
--   03. 003_authz_and_integrity.sql

-- ==========================================================================
-- 001_fk_deferrable.sql
-- ==========================================================================

-- Patch 001 — make the two guard FKs deferrable
--
-- Applies to a database already provisioned from apply_all.sql before this fix.
-- A fresh apply of supabase/migrations/ already includes it; this is only for
-- catching up an existing project. Idempotent — safe to run twice.
--
-- WHY
-- recipe_items.ingredient_id and order_items.dish_id were ON DELETE RESTRICT. The
-- intent is right: never orphan a bill of materials or a historical order line by
-- deleting the thing it points at. But RESTRICT is checked IMMEDIATELY, and that
-- makes deleting a whole restaurant impossible.
--
-- Deleting a restaurant cascades to ingredients AND to dishes AND (through dishes
-- and orders) to recipe_items and order_items. Postgres does not guarantee the
-- order between those sibling cascade paths, so if it reaches ingredients before
-- recipe_items, RESTRICT fires and the entire delete is refused — with an error
-- that names ingredients and recipe_items and gives no hint that the real subject
-- was a restaurant.
--
-- NO ACTION enforces exactly the same rule, but its check CAN be deferred to
-- commit time. Deferred, the cascade settles first and the constraint then
-- confirms nothing was actually orphaned. Same guarantee, no false failure.
--
-- Paste into the Supabase SQL editor and run.

begin;

alter table recipe_items
  drop constraint if exists recipe_items_ingredient_id_fkey;

alter table recipe_items
  add constraint recipe_items_ingredient_id_fkey
  foreign key (ingredient_id) references ingredients (id)
  on delete no action deferrable initially deferred;

alter table order_items
  drop constraint if exists order_items_dish_id_fkey;

alter table order_items
  add constraint order_items_dish_id_fkey
  foreign key (dish_id) references dishes (id)
  on delete no action deferrable initially deferred;

commit;

-- Verify:
--   select conname, condeferrable, condeferred, confdeltype
--     from pg_constraint
--    where conname in ('recipe_items_ingredient_id_fkey', 'order_items_dish_id_fkey');
-- Expect condeferrable = t, condeferred = t, confdeltype = 'a' (no action).

-- ==========================================================================
-- 002_public_velocity.sql
-- ==========================================================================

-- Patch 002 — let guests read dish velocity
--
-- Paste into the Supabase SQL editor and run. Idempotent.
--
-- WHY
-- The guest menu's whole differentiator is showing a diner "4 left · about 40
-- minutes". The portion count comes from `menu_public`, which any guest can read.
-- The TIME comes from `dish_velocity`, whose read policy requires is_staff() — so
-- an anonymous diner gets portions but no prediction, which is exactly the half of
-- the feature that makes it more than a stock counter.
--
-- Three ways to fix it were considered:
--
--   1. Reimplement the banding, suppression and cold-start rules in SQL as a view.
--      Rejected: two implementations of the same maths, which will drift. The
--      TypeScript engine has 61 tests; a SQL twin would have none.
--   2. A security-definer function returning only derived minutes. Same problem —
--      the maths still has to live in SQL.
--   3. Allow public read of dish_velocity, and keep ONE tested implementation.
--
-- Chose 3. Honest trade-off: sell rate per dish becomes readable through the
-- public API. It is aggregate, non-personal, carries no cost or margin, and the
-- guest UI never displays the rate itself — only the derived "about 40 minutes".
-- For a production multi-tenant deployment you would wrap this in a view that
-- exposes only the derived figure; for this build, one source of truth for the
-- maths is worth more than concealing how fast the branzino sells.

begin;

drop policy if exists dish_velocity_read_public on dish_velocity;

create policy dish_velocity_read_public on dish_velocity
  for select using (true);

commit;

-- Verify (as an anonymous caller):
--   curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/dish_velocity?select=dish_id&limit=1" \
--        -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
-- Expect a row, not [].

-- ==========================================================================
-- 003_authz_and_integrity.sql
-- ==========================================================================

-- Patch 003 — close the authorization and integrity gaps an adversarial audit found
--
-- Paste into the Supabase SQL editor and run. Idempotent.
--
-- Every item here is a case where the CODE OR DOCS CLAIMED a guarantee the schema did
-- not actually enforce. Each is stated as the false claim it corrects, because that is
-- the thing worth remembering.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. advance_item_status() checked NEITHER station NOR tenant.
--
-- FALSE CLAIM: "Role + station gated: a chef can do fired/cooking/plated on their
-- own station only." It never checked station, and never checked that the item even
-- belonged to the caller's restaurant. Demonstrated by having host@brigade.test fire
-- a grill ticket: HTTP 204.
--
-- A host firing food is not a hypothetical — it desynchronises the pass from what is
-- actually cooking, which is the exact failure the KDS exists to prevent. And with no
-- tenant check, any authenticated staff member of ANY restaurant could advance any
-- item in the database.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function advance_item_status(p_item_id uuid, p_to item_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from       item_status;
  v_station    station;
  v_restaurant uuid;
  v_role       app_role := current_role_of();
  v_mine       uuid     := current_restaurant();
  v_ok         boolean  := false;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN' using detail = 'staff only';
  end if;

  -- Tenant and station now come from the row itself, not from the caller's claim.
  select oi.status, oi.station, o.restaurant_id
    into v_from, v_station, v_restaurant
    from order_items oi
    join orders o on o.id = oi.order_id
   where oi.id = p_item_id;

  if v_from is null then
    raise exception 'NOT_FOUND';
  end if;

  -- MULTI-TENANCY: the item must belong to the caller's restaurant.
  if v_mine is null or v_restaurant <> v_mine then
    raise exception 'FORBIDDEN' using detail = 'that ticket belongs to another restaurant';
  end if;

  v_ok := (v_from = 'placed'  and p_to = 'fired')
       or (v_from = 'fired'   and p_to = 'cooking')
       or (v_from = 'cooking' and p_to = 'plated')
       or (v_from = 'plated'  and p_to = 'served');

  if not v_ok then
    raise exception 'ILLEGAL_TRANSITION' using detail = format('%s -> %s', v_from, p_to);
  end if;

  -- Cooking transitions belong to the kitchen. A host or a maître d' does not fire food.
  if p_to in ('fired', 'cooking', 'plated')
     and v_role not in ('chef', 'expo', 'manager', 'owner') then
    raise exception 'FORBIDDEN'
      using detail = 'firing and plating belong to the kitchen';
  end if;

  -- A chef de partie works THEIR station. Expo and managers work the whole pass.
  if v_role = 'chef' then
    if not exists (
      select 1 from profiles
       where id = auth.uid() and station is not null and station = v_station
    ) then
      raise exception 'FORBIDDEN'
        using detail = format('that ticket is on %s, not your station', v_station);
    end if;
  end if;

  -- Sending a plate away is expo's call (or the floor's, or a manager's).
  if p_to = 'served' and v_role not in ('expo', 'server', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using detail = 'sending a plate away belongs to expo';
  end if;

  update order_items
     set status    = p_to,
         fired_at  = case when p_to = 'fired'  then now() else fired_at  end,
         plated_at = case when p_to = 'plated' then now() else plated_at end,
         served_at = case when p_to = 'served' then now() else served_at end
   where id = p_item_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Ingredient COST was readable by every staff role.
--
-- FALSE CLAIM: docs/03-data-model.md — "cost and margin fields are gated to
-- owner/manager", and migration 010b's own comment claims column protection exists.
-- No REVOKE was ever written, and ingredients_read permitted any staff role, so a
-- chef's JWT could read cost_per_unit_cents straight from PostgREST.
--
-- Fixing the policy alone would break the pantry for non-managers, so both halves
-- must land together: restrict the base table, and make the cost-free projection
-- security DEFINER so it can still serve them.
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists ingredients_read on ingredients;

create policy ingredients_read on ingredients
  for select using (restaurant_id = current_restaurant() and is_manager());

-- Cost-free projection. security DEFINER (the default) so it bypasses the policy
-- above, with tenancy re-imposed inside the view via the definer helper. An
-- anonymous caller has current_restaurant() = null, so they get nothing.
create or replace view ingredients_public as
select
  i.id, i.restaurant_id, i.name, i.unit, i.stock_qty, i.par_level, i.reorder_point,
  i.supplier_id, i.shelf_life_days, i.created_at
from ingredients i
where i.restaurant_id = current_restaurant();

comment on view ingredients_public is
  'Ingredients WITHOUT cost_per_unit_cents, scoped to the caller''s restaurant. Non-manager staff surfaces must read this; the base table is manager/owner only.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. dish_binding_ingredient leaked exact pantry stock to ANONYMOUS callers.
--
-- It was created without security_invoker, so it ran as owner and bypassed RLS
-- entirely — any anonymous visitor could read every ingredient name and its exact
-- stock level. Rebuilt on ingredients_public so it inherits that view's tenancy
-- filter and its absence of cost.
-- ═══════════════════════════════════════════════════════════════════════════════

drop view if exists dish_binding_ingredient;

create view dish_binding_ingredient as
select distinct on (d.id)
  d.id            as dish_id,
  i.id            as ingredient_id,
  i.name          as ingredient_name,
  i.stock_qty,
  ri.qty          as qty_per_portion,
  floor(i.stock_qty / nullif(ri.qty, 0))::int as portions_from_this
from dishes d
join recipe_items ri     on ri.dish_id = d.id
join ingredients_public i on i.id = ri.ingredient_id
where d.is_archived = false
order by d.id, floor(i.stock_qty / nullif(ri.qty, 0)) asc, i.name asc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. A manager could PATCH ingredients.stock_qty directly through PostgREST,
--    bypassing adjust_stock() and writing NO ledger row.
--
-- FALSE CLAIM: "Stock is only ever mutated by place_order() or adjust_stock()." That
-- is the single invariant the whole waste-variance and audit story rests on, and the
-- REST API let anyone with the manager role step straight around it.
--
-- Column-level REVOKE: managers keep par_level, reorder_point, cost etc.; the
-- projection itself becomes writable only by the definer functions.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ⚠ A column-level REVOKE alone would be a NO-OP here, which is a trap worth naming.
-- Postgres: "the revocation of a column-level privilege will not revoke a table-level
-- privilege" — and Supabase grants table-wide UPDATE to `authenticated` by default. So
-- `revoke update (stock_qty)` looks like it works and changes nothing.
--
-- The working shape is: drop the table-wide grant, then re-grant every column EXCEPT
-- stock_qty. RLS still applies on top (ingredients_write requires is_manager()); this
-- is about which COLUMNS a manager may touch, not who counts as a manager.
revoke update on ingredients from authenticated;
revoke update on ingredients from anon;

grant update (
  name, unit, par_level, reorder_point, cost_per_unit_cents, supplier_id, shelf_life_days
) on ingredients to authenticated;

-- Belt and braces: stock cannot be negative. place_order() already refuses, but
-- nothing stopped a correction driving it below zero.
alter table ingredients drop constraint if exists ingredients_stock_non_negative;
alter table ingredients
  add constraint ingredients_stock_non_negative check (stock_qty >= 0);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. A guest could attach themselves to any restaurant.
--
-- profiles_update_self pinned `role` but not `restaurant_id`, so a guest could set
-- restaurant_id to a real tenant. That alone grants nothing (every staff policy also
-- requires is_staff()), but it makes current_restaurant() return a restaurant they
-- have no relationship with, which is a foothold rather than a breach. Pin it.
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists profiles_update_self on profiles;

create policy profiles_update_self on profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = current_role_of()
    and restaurant_id is not distinct from current_restaurant()
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Guests could read recipe_items QUANTITIES.
--
-- FALSE CLAIM: SOLUTION.md — "Ingredient names are shown for transparency; quantities
-- are not, because quantities are the recipe." recipe_items_read was `using (true)`,
-- so the quantities were one REST call away.
--
-- Guests get a names-only projection; the quantities become staff-only.
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists recipe_items_read on recipe_items;

create policy recipe_items_read on recipe_items
  for select using (is_staff());

-- Names only, no quantities, no cost. Definer so a guest can read it.
create or replace view dish_ingredient_names as
select ri.dish_id, i.name as ingredient_name
from recipe_items ri
join ingredients i on i.id = ri.ingredient_id;

comment on view dish_ingredient_names is
  'Ingredient NAMES per dish for the guest dish page. Deliberately carries no qty and no cost — the quantities are the recipe.';

-- sql-lint flags this view for having no security mode, and the answer is: intentional.
-- It CANNOT filter on current_restaurant(), because a guest's profile has
-- restaurant_id = null by design (guests are global, staff belong to a restaurant), so
-- any tenancy filter here would return nothing and break the dish page for exactly the
-- people it exists for. What it exposes is the ingredient names of a publicly-readable
-- menu — which a printed menu already tells you. No qty, no cost, no stock.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. pay_order() — a guest could not pay their own bill.
--
-- Settling a bill has to insert a payment AND move orders.status to 'paid' AND put
-- the table into 'dirty'. But `orders_write_staff` is the only update policy on
-- orders, so a guest hitting PostgREST directly could never close their own order —
-- the billing flow had no path to completion for the person holding the bill.
--
-- Definer function with an explicit ownership check, mirroring place_order(): the
-- guarantee lives in one place rather than being spread across three policies.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function pay_order(
  p_order_id uuid,
  p_method   text default 'card',
  p_tip_cents int  default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order      record;
  v_unserved   int;
  v_subtotal   int;
  v_tax_rate   numeric;
  v_tax        int;
  v_payment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_tip_cents < 0 then
    raise exception 'BAD_TIP';
  end if;

  select * into v_order from orders where id = p_order_id;
  if v_order is null then raise exception 'NOT_FOUND'; end if;

  -- The bill belongs to the guest who placed it, or to staff of that restaurant.
  if not (
    v_order.guest_id = auth.uid()
    or (is_staff() and v_order.restaurant_id = current_restaurant())
  ) then
    raise exception 'FORBIDDEN' using detail = 'that is not your bill';
  end if;

  -- Idempotent: an already-settled order returns its existing payment rather than
  -- charging twice. Double-tapping "Pay" must not produce two payments.
  select id into v_payment_id
    from payments where order_id = p_order_id and status = 'succeeded' limit 1;
  if v_payment_id is not null then
    return v_payment_id;
  end if;

  -- Charging for food that never arrived is the worst possible bug in billing.
  select count(*) into v_unserved
    from order_items
   where order_id = p_order_id and status not in ('served', 'voided');
  if v_unserved > 0 then
    raise exception 'ITEMS_NOT_SERVED'
      using detail = format('%s item(s) still with the kitchen', v_unserved);
  end if;

  -- Priced from what was actually SERVED, at the price captured on the line.
  select coalesce(sum(unit_price_cents * qty), 0)::int into v_subtotal
    from order_items where order_id = p_order_id and status = 'served';

  select tax_rate into v_tax_rate from restaurants where id = v_order.restaurant_id;
  -- Rounded ONCE, on the total. Per-line rounding produces bills that don't add up.
  v_tax := round(v_subtotal * coalesce(v_tax_rate, 0));

  insert into payments (order_id, method, amount_cents, status, provider_ref)
  values (p_order_id, p_method, v_subtotal + v_tax + p_tip_cents, 'succeeded',
          'simulated-' || substr(p_order_id::text, 1, 8))
  returning id into v_payment_id;

  update orders
     set status         = 'paid',
         closed_at      = now(),
         subtotal_cents = v_subtotal,
         tax_cents      = v_tax,
         tip_cents      = p_tip_cents,
         total_cents    = v_subtotal + v_tax + p_tip_cents
   where id = p_order_id;

  -- Closing a bill never frees a table straight to 'open' — someone has to clear it.
  if v_order.table_id is not null then
    update tables set status = 'dirty' where id = v_order.table_id;
  end if;

  return v_payment_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. join_queue() — same shape of gap for the walk-in queue.
--
-- queue_insert_own lets a guest insert their own row, but the QUOTE has to be
-- computed from other parties' rows and historical turn times, which a guest cannot
-- read. Computing it client-side from visible data would produce a number based on
-- whatever fraction of the queue that guest happens to be allowed to see.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function join_queue(
  p_restaurant_id uuid,
  p_party_size    int,
  p_guest_name    text default ''
-- NOTE: the out-column is `queue_position`, not `position`. `position` is a reserved
-- word in Postgres (it is the position(substring in string) function), so it cannot
-- name a column in a RETURNS TABLE clause without quoting — and quoted identifiers
-- are worse to live with than a clearer name.
) returns table (queue_id uuid, queue_position int, quoted_minutes int)
language plpgsql security definer set search_path = public as $$
declare
  v_ahead      int;
  v_fitting    int;
  v_median     numeric;
  v_quote      int;
  v_id         uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_party_size < 1 or p_party_size > 20 then raise exception 'BAD_PARTY_SIZE'; end if;

  -- One active entry per guest — the unique index enforces it, this is the friendly error.
  if exists (
    select 1 from queue_entries
     where guest_id = auth.uid() and status in ('waiting', 'notified')
  ) then
    raise exception 'ALREADY_QUEUED' using detail = 'you are already in the queue';
  end if;

  select count(*) into v_ahead
    from queue_entries
   where restaurant_id = p_restaurant_id
     and status in ('waiting', 'notified')
     and party_size >= p_party_size;

  select greatest(count(*), 1) into v_fitting
    from tables
   where restaurant_id = p_restaurant_id and seats >= p_party_size;

  -- Median of REAL seated→paid durations for comparable tables. Below 10 samples this
  -- is not a measurement, so fall back to a stated default rather than dress a guess
  -- as data.
  select percentile_cont(0.5) within group (order by extract(epoch from (o.closed_at - o.opened_at)) / 60)
    into v_median
    from orders o
    join tables t on t.id = o.table_id
   where o.restaurant_id = p_restaurant_id
     and o.status = 'paid'
     and o.closed_at is not null
     and t.seats >= p_party_size
     and extract(epoch from (o.closed_at - o.opened_at)) / 60 between 1 and 360
   having count(*) >= 10;

  v_quote := ceil(coalesce(v_median, 75) * ceil(v_ahead::numeric / v_fitting));
  if v_quote < 5 then v_quote := 5; end if;

  insert into queue_entries (restaurant_id, guest_id, guest_name, party_size, quoted_minutes, status)
  values (p_restaurant_id, auth.uid(), coalesce(p_guest_name, ''), p_party_size, v_quote, 'waiting')
  returning id into v_id;

  return query select v_id, v_ahead + 1, v_quote;
end;
$$;

commit;

-- ── verify ───────────────────────────────────────────────────────────────────
-- As an ANONYMOUS caller, all three of these must return [] :
--   /rest/v1/ingredients?select=cost_per_unit_cents&limit=1
--   /rest/v1/dish_binding_ingredient?select=stock_qty&limit=1
--   /rest/v1/recipe_items?select=qty&limit=1
-- and this must return rows:
--   /rest/v1/dish_ingredient_names?select=ingredient_name&limit=3
--
-- As host@brigade.test, firing a kitchen ticket must now be REFUSED:
--   POST /rest/v1/rpc/advance_item_status {"p_item_id":"<placed grill item>","p_to":"fired"}
--   expect 4xx with FORBIDDEN, detail "firing and plating belong to the kitchen"
