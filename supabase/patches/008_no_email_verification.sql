-- 008 — an account works without confirming its email address.
--
-- REQUESTED CHANGE, not a bug fix. Recorded as such so nobody later reads it as one.
--
-- WHAT CHANGES
-- place_order() refused with EMAIL_NOT_VERIFIED unless auth.users.email_confirmed_at was
-- set. That check is removed, so a brand-new account can order immediately. Everything
-- else about ordering is untouched: you must still be signed in (NOT_AUTHENTICATED), the
-- dishes must belong to this restaurant, and the stock re-check inside the transaction is
-- unchanged.
--
-- WHAT THIS COSTS, stated plainly because it is a real trade-off and not a free win:
--   - an order can now be placed against an address nobody has proved they own, so a
--     mistyped or throwaway address gets a real order attached to it
--   - a no-show cannot be chased by email with any confidence
--   - it removes the cheapest bot deterrent the signup path had
-- For a demo and a hackathon judge who wants to order in fifteen seconds, that is a
-- sensible trade. For a real restaurant taking real money it would not be, and the
-- honest place for that sentence is here rather than nowhere.
--
-- ALSO REQUIRED, OUTSIDE THIS FILE. Supabase must stop demanding confirmation at signup:
--   Dashboard -> Authentication -> Providers -> Email -> turn OFF "Confirm email".
-- With it ON, supabase.auth.signUp() returns a user but NO SESSION, so the account exists
-- and cannot be used — which is a worse experience than the check this patch removes. The
-- SQL below cannot influence that setting; it lives in the project's auth config.
--
-- The whole body of place_order() is restated because that is what create or replace
-- requires. The ONLY difference from patch 006's version is the deleted email block,
-- marked below. The lock ordering, the per-ingredient aggregation and the tenancy check
-- are byte-for-byte the same.

begin;

create or replace function place_order(
  p_restaurant_id   uuid,
  p_table_id        uuid,
  p_items           jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guest      uuid := auth.uid();
  v_order_id   uuid;
  v_lock       record;
  v_short      record;
  v_item       record;
  v_subtotal   int := 0;
  v_tax_rate   numeric;
  v_tax        int;
  v_item_id    uuid;
  v_existing   uuid;
begin
  if v_guest is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- (008) The email-confirmation gate was here and is deliberately gone. Signing in is
  -- still required; proving you own the address is not.

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  ------------------------------------------------------------------
  -- Every dish must be on THIS restaurant's menu (006).
  ------------------------------------------------------------------
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
      left join dishes d on d.id = x.dish_id
     where d.id is null
        or d.restaurant_id <> p_restaurant_id
        or d.is_archived
  ) then
    raise exception 'BAD_ITEMS'
      using detail = 'that dish is not on this restaurant''s menu';
  end if;

  if p_table_id is not null and not exists (
    select 1 from tables where id = p_table_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'BAD_ITEMS' using detail = 'that table is not in this restaurant';
  end if;

  -- Double-tap protection: return the existing order rather than creating a second.
  if p_idempotency_key is not null then
    select id into v_existing from orders
     where guest_id = v_guest and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  ------------------------------------------------------------------
  -- 1. Lock every implicated ingredient row, ORDERED BY id.
  --
  -- The ordering is not cosmetic. Two concurrent orders touching an
  -- overlapping ingredient set will DEADLOCK if they acquire locks in
  -- different sequences. Sorting makes acquisition order consistent.
  ------------------------------------------------------------------
  for v_lock in
    select i.id
      from ingredients i
     where i.id in (
       select ri.ingredient_id
         from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
         join recipe_items ri on ri.dish_id = x.dish_id
     )
     order by i.id
       for update
  loop
    null;  -- the lock is the point
  end loop;

  ------------------------------------------------------------------
  -- 2. Re-check availability INSIDE the transaction, against the locked rows.
  --
  -- Demand is aggregated PER INGREDIENT across the whole order, not per dish.
  -- Two different dishes sharing the last 3 lemons would each pass an
  -- independent check and collectively oversell.
  ------------------------------------------------------------------
  select i.name, i.stock_qty, agg.required
    into v_short
    from (
      select ri.ingredient_id, sum(ri.qty * x.qty) as required
        from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
        join recipe_items ri on ri.dish_id = x.dish_id
       group by ri.ingredient_id
    ) agg
    join ingredients i on i.id = agg.ingredient_id
   where agg.required > i.stock_qty
   order by (agg.required - i.stock_qty) desc
   limit 1;

  if v_short is not null then
    declare
      v_dish_name text;
      v_portions  int;
    begin
      select d.name, av.portions
        into v_dish_name, v_portions
        from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
        join dishes d on d.id = x.dish_id
        join dish_availability av on av.dish_id = d.id
       where x.qty > av.portions
       order by av.portions asc
       limit 1;

      raise exception 'INSUFFICIENT_STOCK'
        using detail = coalesce(v_dish_name, 'an item') || '|' || coalesce(v_portions, 0)::text;
    end;
  end if;

  -- Manual 86 also blocks ordering.
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int)
      join dishes d on d.id = x.dish_id
     where d.manual_86_until is not null and d.manual_86_until > now()
  ) then
    raise exception 'INSUFFICIENT_STOCK' using detail = 'that dish|0';
  end if;

  ------------------------------------------------------------------
  -- 3. Create the order
  ------------------------------------------------------------------
  insert into orders (restaurant_id, table_id, guest_id, status, idempotency_key)
  values (p_restaurant_id, p_table_id, v_guest, 'open', p_idempotency_key)
  returning id into v_order_id;

  ------------------------------------------------------------------
  -- 4. Items at prices captured NOW, + 5. ledger depletion, + 6. projection
  ------------------------------------------------------------------
  for v_item in
    select x.dish_id, x.qty, x.notes, d.price_cents, d.station
      from jsonb_to_recordset(p_items) as x(dish_id uuid, qty int, notes text)
      join dishes d on d.id = x.dish_id
  loop
    insert into order_items (order_id, dish_id, qty, unit_price_cents, station, notes)
    values (v_order_id, v_item.dish_id, v_item.qty, v_item.price_cents, v_item.station, v_item.notes)
    returning id into v_item_id;

    v_subtotal := v_subtotal + (v_item.price_cents * v_item.qty);

    insert into stock_movements (ingredient_id, delta, reason, order_item_id, actor_id)
    select ri.ingredient_id, -(ri.qty * v_item.qty), 'depletion', v_item_id, v_guest
      from recipe_items ri
     where ri.dish_id = v_item.dish_id;

    update ingredients i
       set stock_qty = i.stock_qty - (ri.qty * v_item.qty)
      from recipe_items ri
     where ri.dish_id = v_item.dish_id and i.id = ri.ingredient_id;
  end loop;

  ------------------------------------------------------------------
  -- 7. Totals. Integer cents; rounded ONCE on the total, never per line.
  ------------------------------------------------------------------
  select tax_rate into v_tax_rate from restaurants where id = p_restaurant_id;
  v_tax := round(v_subtotal * coalesce(v_tax_rate, 0));

  update orders
     set subtotal_cents = v_subtotal,
         tax_cents      = v_tax,
         total_cents    = v_subtotal + v_tax
   where id = v_order_id;

  return v_order_id;
end;
$$;

commit;

-- Verify — as a signed-in account with email_confirmed_at NULL:
--   select place_order('<restaurant>', null, '[{"dish_id":"<dish>","qty":1}]'::jsonb);
--   --> a uuid, where it previously raised EMAIL_NOT_VERIFIED
--
-- And confirm nothing else loosened: scripts/sql-check.sh still asserts every tenancy and
-- ledger guarantee, and verify:features still drives the full order-to-bill circuit.
