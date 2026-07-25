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
