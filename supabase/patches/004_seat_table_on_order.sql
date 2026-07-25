-- 004 — a table with an open order is not a free table.
--
-- FOUND BY: npm run verify:features, first run.
--
-- The floor map colours a table by `tables.status`. `pay_order()` correctly releases a
-- settled table to 'dirty' so it gets bussed rather than re-seated. Nothing ever set the
-- other end of that transition: ordering at table 10 left it 'open', so the floor screen
-- showed a table with food on it as available. Only the seed script ever wrote 'seated',
-- which is why every screenshot looked right and the live behaviour did not.
--
-- Why a trigger and not an edit to place_order():
--   place_order() is 130 lines of locking and ledger arithmetic with a deadlock-ordering
--   comment on it. Replacing the whole body to add one UPDATE is a large diff over
--   delicate code for a small rule. The rule is also broader than ordering — ANY order
--   attached to a table means that table is occupied, however the order got there — so it
--   belongs to the orders table, not to one function that happens to insert into it.
--
-- Only 'open' and 'held' are promoted. 'held' is a reservation waiting for its party, and
-- them ordering is exactly the event that turns a hold into a seating. 'dirty' is left
-- alone: a table needing a clean still needs a clean, and quietly clearing that flag
-- because an order arrived would lose the only signal the busser has.
--
-- Idempotent: create or replace + drop trigger if exists.

begin;

create or replace function seat_table_on_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.table_id is not null then
    update tables
       set status = 'seated'
     where id = new.table_id
       and status in ('open', 'held');
  end if;
  return new;
end;
$$;

comment on function seat_table_on_order is
  'Marks a table seated when an order is attached to it. The floor map reads tables.status, and a table with food on it is not available.';

drop trigger if exists orders_seat_table on orders;

create trigger orders_seat_table
  after insert on orders
  for each row execute function seat_table_on_order();

commit;

-- Verify:
--   place an order against an 'open' table, then
--   select status from tables where id = '<that table>';   -->  seated
--   pay it, then the same query                            -->  dirty
--
-- Covered mechanically by the assertion in scripts/sql-check.sh and end to end by
-- "The floor plan" in npm run verify:features.
