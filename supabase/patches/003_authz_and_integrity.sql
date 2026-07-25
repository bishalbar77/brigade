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

revoke update (stock_qty) on ingredients from authenticated;
revoke update (stock_qty) on ingredients from anon;

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
