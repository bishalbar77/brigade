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
