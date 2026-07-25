-- Brigade — all pending patches, concatenated. GENERATED FILE, do not edit.
-- Regenerate with: npm run sql:bundle
--
-- Paste into the Supabase SQL editor and run. Every patch is idempotent, so
-- re-running this is safe. NOT wrapped in one transaction: each patch already
-- manages its own, and one failing patch should not roll back the others.
--
--   01. 001_fk_deferrable.sql
--   02. 002_public_velocity.sql

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
