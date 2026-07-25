-- 009 — functions
-- place_order() is the correctness centrepiece. See docs/features/ordering.md.

-- ---------------------------------------------------------------------------
-- RLS helpers. security definer so policies can read profiles without recursing
-- through profiles' own RLS.
-- ---------------------------------------------------------------------------

create function current_restaurant() returns uuid
language sql stable security definer set search_path = public as $$
  select restaurant_id from profiles where id = auth.uid()
$$;

create function current_role_of() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) <> 'guest',
    false)
$$;

create function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) in ('owner', 'manager'),
    false)
$$;

-- ---------------------------------------------------------------------------
-- adjust_stock — the ONLY sanctioned way to change stock besides place_order().
-- Never a bare UPDATE ingredients SET stock_qty: the ledger and the projection
-- must stay in agreement (ADR-5).
-- ---------------------------------------------------------------------------

create function adjust_stock(
  p_ingredient_id uuid,
  p_delta         numeric,
  p_reason        movement_reason,
  p_note          text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_new_qty numeric;
begin
  if not is_manager() then
    raise exception 'FORBIDDEN' using detail = 'stock adjustment requires manager or owner';
  end if;

  insert into stock_movements (ingredient_id, delta, reason, actor_id, note)
  values (p_ingredient_id, p_delta, p_reason, auth.uid(), p_note);

  update ingredients
     set stock_qty = stock_qty + p_delta
   where id = p_ingredient_id
  returning stock_qty into v_new_qty;

  return v_new_qty;
end;
$$;

-- Records a physical count as a CORRECTION for the difference, rather than
-- overwriting the balance. The gap between counted and expected IS the variance
-- signal — overwriting destroys the data waste analysis needs.
create function record_count(p_ingredient_id uuid, p_counted_qty numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_expected numeric;
begin
  if not is_manager() then
    raise exception 'FORBIDDEN';
  end if;

  select stock_qty into v_expected from ingredients where id = p_ingredient_id;
  if v_expected is null then
    raise exception 'NOT_FOUND';
  end if;

  return adjust_stock(
    p_ingredient_id,
    p_counted_qty - v_expected,
    'count',
    format('counted %s, expected %s', p_counted_qty, v_expected)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- place_order — atomic. Two guests must not both be sold the last portion.
--
-- p_items: [{ "dish_id": uuid, "qty": int, "notes": text }]
-- ---------------------------------------------------------------------------

create function place_order(
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

  -- Verified email is enforced HERE, not only in the UI.
  if not exists (
    select 1 from auth.users
     where id = v_guest and email_confirmed_at is not null
  ) then
    raise exception 'EMAIL_NOT_VERIFIED'
      using detail = 'verify your email address before ordering';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
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
    -- Report the affected DISH and its real remaining portions. The guest is never
    -- told which ingredient is short — that's staff information.
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

-- ---------------------------------------------------------------------------
-- void_order_item — reverses stock with a COMPENSATING ledger row.
-- The original depletion row is never deleted; the ledger is append-only.
-- ---------------------------------------------------------------------------

create function void_order_item(p_item_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  select oi.*, o.restaurant_id into v_item
    from order_items oi join orders o on o.id = oi.order_id
   where oi.id = p_item_id;

  if v_item is null then raise exception 'NOT_FOUND'; end if;
  if v_item.status = 'voided' then return; end if;

  insert into stock_movements (ingredient_id, delta, reason, order_item_id, actor_id, note)
  select ri.ingredient_id, (ri.qty * v_item.qty), 'correction', p_item_id, auth.uid(),
         coalesce(p_reason, 'item voided')
    from recipe_items ri
   where ri.dish_id = v_item.dish_id;

  update ingredients i
     set stock_qty = i.stock_qty + (ri.qty * v_item.qty)
    from recipe_items ri
   where ri.dish_id = v_item.dish_id and i.id = ri.ingredient_id;

  update order_items set status = 'voided' where id = p_item_id;

  -- recompute the bill from the surviving items
  update orders o
     set subtotal_cents = sub.st,
         tax_cents      = round(sub.st * r.tax_rate),
         total_cents    = sub.st + round(sub.st * r.tax_rate)
    from (
      select order_id, coalesce(sum(unit_price_cents * qty), 0)::int as st
        from order_items
       where order_id = v_item.order_id and status <> 'voided'
       group by order_id
    ) sub,
    restaurants r
   where o.id = v_item.order_id and sub.order_id = o.id and r.id = o.restaurant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- advance_item_status — transitions validated server-side.
-- A cook's fat-finger must not mark food served that was never cooked.
-- ---------------------------------------------------------------------------

create function advance_item_status(p_item_id uuid, p_to item_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from item_status;
  v_role app_role := current_role_of();
  v_ok   boolean := false;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_from from order_items where id = p_item_id;
  if v_from is null then raise exception 'NOT_FOUND'; end if;

  -- legal transitions only
  v_ok := (v_from, p_to) in (
    ('placed','fired'), ('fired','cooking'), ('cooking','plated'), ('plated','served')
  );

  if not v_ok then
    raise exception 'ILLEGAL_TRANSITION'
      using detail = format('%s -> %s', v_from, p_to);
  end if;

  -- expo owns the pass
  if p_to = 'served' and v_role not in ('expo', 'server', 'manager', 'owner') then
    raise exception 'FORBIDDEN' using detail = 'plated -> served belongs to expo';
  end if;

  update order_items
     set status   = p_to,
         fired_at  = case when p_to = 'fired'  then now() else fired_at  end,
         plated_at = case when p_to = 'plated' then now() else plated_at end,
         served_at = case when p_to = 'served' then now() else served_at end
   where id = p_item_id;
end;
$$;
