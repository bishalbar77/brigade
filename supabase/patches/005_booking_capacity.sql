-- 005 — booking was refused for every real diner. Same class of bug as join_queue().
--
-- FOUND BY: npm run verify:features — "a diner can book a table" → HTTP 409 NO_CAPACITY,
-- at every time of every day for a party of two, in a restaurant with 14 tables.
--
-- THE BUG
-- /api/reservations decided capacity like this, using the CALLER's session:
--
--     tables       where seats >= party_size          -> "how many could fit them"
--     reservations where status in (booked, seated)    -> "how many are already taken"
--     if fitting - taken <= 0 then NO_CAPACITY
--
-- `tables_read` requires is_staff(). A diner is not staff, so the first query returned
-- zero rows, so `fitting` was 0, so `0 - 0 <= 0` was true, so every booking anyone ever
-- attempted was refused as "fully booked". The seeded bookings all exist because the seed
-- script writes with the service key, which is exactly why the feature looked complete:
-- the book was full of reservations that the product itself could not have taken.
--
-- The /reserve page had the mirror image of the same fault. It counted tables it also
-- could not see, fell back to `|| 1`, and read only the caller's OWN reservations — so it
-- drew almost every slot as available, and then the API refused all of them. A screen
-- that offers what the server will reject is worse than one that offers nothing.
--
-- THE FIX, in three parts:
--
--   1. book_table() — a security-definer function that makes the capacity decision with
--      full visibility and inserts in the same breath. This is the same shape as
--      place_order() and join_queue(), and for the same reason: the rule needs data the
--      caller is not allowed to read, so it cannot live in the caller.
--
--   2. restaurant_table_count — how many tables a restaurant has, and their seat range.
--      Not sensitive: it is visible to anyone who walks in and looks.
--
--   3. reservation_load — WHEN the book is busy and for what party size, with no name and
--      no guest id. This is what every booking site on earth shows you. It lets the page
--      grey out full slots honestly instead of guessing.
--
-- Both views intentionally run with owner rights, because a guest cannot read the
-- underlying tables at all and a security_invoker view would return nothing — which is
-- the bug this patch exists to fix. Each exposes strictly less than the table it reads.
--
-- Idempotent: create or replace throughout.

begin;

-- ── 1. the authoritative decision ────────────────────────────────────────────

create or replace function book_table(
  p_restaurant_id uuid,
  p_party_size    int,
  p_requested_at  timestamptz,
  p_guest_name    text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guest    uuid := auth.uid();
  v_fitting  int;
  v_taken    int;
  v_id       uuid;
begin
  if v_guest is null then
    raise exception 'NOT_AUTHENTICATED' using detail = 'sign in to book a table';
  end if;

  if p_party_size < 1 or p_party_size > 20 then
    raise exception 'BAD_PARTY_SIZE' using detail = 'parties of 1 to 20';
  end if;

  -- A minute of slack, so a request sent as the clock ticks over is not rejected.
  if p_requested_at < now() - interval '1 minute' then
    raise exception 'BAD_TIME' using detail = 'choose a time in the future';
  end if;

  select count(*) into v_fitting
    from tables
   where restaurant_id = p_restaurant_id
     and seats >= p_party_size;

  if v_fitting = 0 then
    -- No table in the building seats them. A different fact from "that hour is busy",
    -- and the guest should be told the difference.
    raise exception 'PARTY_TOO_LARGE'
      using detail = 'no table here seats a party of ' || p_party_size;
  end if;

  -- ±90 minutes: a booking occupies a table either side of its own slot.
  select count(*) into v_taken
    from reservations
   where restaurant_id = p_restaurant_id
     and status in ('booked', 'seated')
     and requested_at between p_requested_at - interval '90 minutes'
                          and p_requested_at + interval '90 minutes';

  if v_fitting - v_taken <= 0 then
    raise exception 'NO_CAPACITY' using detail = 'that time is fully booked';
  end if;

  -- One booking per guest per slot. Without this a double-tap books twice and quietly
  -- consumes two tables for one party.
  if exists (
    select 1 from reservations
     where guest_id = v_guest
       and status in ('booked', 'seated')
       and requested_at between p_requested_at - interval '60 minutes'
                            and p_requested_at + interval '60 minutes'
  ) then
    raise exception 'ALREADY_BOOKED' using detail = 'you already have a table around then';
  end if;

  insert into reservations
    (restaurant_id, guest_id, guest_name, party_size, requested_at, source, status)
  values
    (p_restaurant_id, v_guest, coalesce(p_guest_name, ''), p_party_size, p_requested_at,
     'web', 'booked')
  returning id into v_id;

  return v_id;
end;
$$;

comment on function book_table is
  'Books a table. Decides capacity with full visibility because tables_read is staff-only, so a diner cannot count the tables the decision depends on.';

-- ── 2 & 3. what a prospective diner may know about availability ──────────────

create or replace view restaurant_table_count as
select
  restaurant_id,
  count(*)::int   as table_count,
  min(seats)::int as min_seats,
  max(seats)::int as max_seats
from tables
group by restaurant_id;

comment on view restaurant_table_count is
  'How many tables, and the seat range. Public: anyone who walks in can count them.';

create or replace view reservation_load as
select restaurant_id, requested_at, party_size
from reservations
where status in ('booked', 'seated');

comment on view reservation_load is
  'When the book is busy, and for how many. No name, no guest id — availability only, which is what every booking site shows.';

grant select on restaurant_table_count to anon, authenticated;
grant select on reservation_load      to anon, authenticated;

commit;

-- Verify (as a signed-in diner, with no staff role):
--   select book_table('<restaurant>', 2, now() + interval '2 days');   --> a uuid
--   select * from restaurant_table_count;                             --> one row, 14
--   select count(*) from reservation_load;                            --> > 0
--
-- Covered mechanically by scripts/sql-check.sh and end to end by "Booking and the
-- walk-in queue" in npm run verify:features.
