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
