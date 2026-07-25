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
