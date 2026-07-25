-- 006 — every view in public was a write path that bypassed RLS, and four
--       security-definer functions never checked which restaurant they were acting on.
--
-- FOUND BY: a six-lens adversarial sweep, then reproduced by hand before writing this.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THE SERIOUS ONE: every view in public accepted writes from `anon`.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Three ordinary facts combine into a hole:
--
--   a. Supabase ships `alter default privileges in schema public grant all on tables
--      to anon, authenticated` — and in Postgres a VIEW is a "table" for the purposes
--      of default privileges. So every view is born with INSERT/UPDATE/DELETE granted
--      to anonymous callers.
--   b. A view over a single table with no aggregate is AUTO-UPDATABLE. Postgres will
--      happily rewrite a write against it into a write against the base table.
--   c. A view created without `security_invoker = true` executes with the OWNER's
--      rights, so the base table's RLS policies are never consulted.
--
-- Each of those is defensible alone. Together they mean the publishable key that ships
-- in the page source could rewrite the database. Reproduced against the live project:
--
--   anon, publishable key only:
--     POST   /rest/v1/reservation_load   {restaurant_id, requested_at, party_size}  -> 201
--     PATCH  /rest/v1/reservation_load?requested_at=eq.…  {party_size: 19}           -> 204
--     DELETE /rest/v1/reservation_load?requested_at=eq.…                             -> 204
--
--   grill@brigade.test, a CHEF, not a manager:
--     PATCH /rest/v1/ingredients?id=eq.<x>       {stock_qty: 999}  -> 403  (correct)
--     PATCH /rest/v1/ingredients_public?id=eq.<x> {stock_qty: 999} -> 204
--     …stock_qty 4.565 -> 999.000, and stock_movements stayed at 28 rows.
--
-- That last one is the repo's first non-negotiable defeated through a side door: stock
-- moved with no ledger entry, by someone with no permission to move it, while the base
-- table correctly refused the identical request. All seven views behaved this way.
--
-- scripts/sql-lint.mjs HAD flagged these views. The warning was dismissed as
-- intentional because a guest genuinely must read them without an account — which is
-- true, and is only an argument about the READ direction. The lint was right; the
-- reasoning that overrode it only considered half the problem.
--
-- Done as a loop over information_schema rather than seven named statements, so it also
-- covers views this patch has not heard of, and so re-running it after adding a view is
-- the fix rather than a no-op.

begin;

do $$
declare v record;
begin
  for v in select table_name from information_schema.views where table_schema = 'public'
  loop
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v.table_name);
    -- Re-granted explicitly: reading is the entire purpose of these views, and a blanket
    -- revoke that also removed SELECT would take the guest menu offline.
    execute format('grant select on public.%I to anon, authenticated', v.table_name);
  end loop;
end $$;

-- A view added AFTER this patch will again inherit write privileges from Supabase's
-- default grants. Re-running this patch fixes it, and scripts/sql-check.sh now asserts
-- that no view in public is writable, so a new one cannot land unnoticed.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. adjust_stock() / record_count() — is_manager() with no tenant check.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Reproduced: a second restaurant's OWNER moved Brigade's stock 4.515 -> 9.515 and left
-- a stock_movements row attributed to themselves. The role gate works; there was simply
-- nothing comparing the ingredient's restaurant to the caller's. Every manager in the
-- database was a manager of every pantry.

create or replace function adjust_stock(
  p_ingredient_id uuid,
  p_delta         numeric,
  p_reason        movement_reason,
  p_note          text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_new_qty numeric;
  v_owner   uuid;
begin
  if not is_manager() then
    raise exception 'FORBIDDEN' using detail = 'stock adjustment requires manager or owner';
  end if;

  select restaurant_id into v_owner from ingredients where id = p_ingredient_id;
  if v_owner is null then
    raise exception 'NOT_FOUND' using detail = 'no such ingredient';
  end if;
  if current_restaurant() is null or v_owner <> current_restaurant() then
    raise exception 'FORBIDDEN' using detail = 'that ingredient belongs to another restaurant';
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

-- record_count() delegates to adjust_stock(), so it inherits the check above — but it
-- reads stock_qty first to compute the variance, and that read needs gating too or it
-- discloses another tenant's stock level through the error message.
create or replace function record_count(p_ingredient_id uuid, p_counted_qty numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_expected numeric;
  v_owner    uuid;
begin
  if not is_manager() then
    raise exception 'FORBIDDEN';
  end if;

  select stock_qty, restaurant_id into v_expected, v_owner
    from ingredients where id = p_ingredient_id;
  if v_expected is null then
    raise exception 'NOT_FOUND';
  end if;
  if current_restaurant() is null or v_owner <> current_restaurant() then
    raise exception 'FORBIDDEN' using detail = 'that ingredient belongs to another restaurant';
  end if;

  return adjust_stock(
    p_ingredient_id,
    p_counted_qty - v_expected,
    'count',
    format('counted %s, expected %s', p_counted_qty, v_expected)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. void_order_item() — two defects: no tenant check, and the bill is not rewritten
--    when the LAST surviving item is voided.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Tenancy: reproduced with a second restaurant's chef voiding a Brigade ticket (204),
-- crediting Brigade's stock and rewriting Brigade's bill. patch 003 added exactly this
-- guard to advance_item_status() and it was never applied here — voiding is the more
-- dangerous of the two, because it moves stock AND money.
--
-- The bill: the recompute was `from (select … group by order_id) sub`. Void every item
-- on an order and that subquery returns NO ROWS, the join matches nothing, and the
-- order keeps its full total — so /bill shows a charge for food that was voided and
-- pay_order() settles it. Reproduced: a one-item order stayed at
-- subtotal 550 / tax 44 / total 594 after its only item was voided.
--
-- Fixed by making the recompute a scalar aggregate with no GROUP BY, which always
-- yields exactly one row (0 when nothing survives) rather than none.

create or replace function void_order_item(p_item_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item     record;
  v_subtotal int;
  v_tax_rate numeric;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  select oi.*, o.restaurant_id into v_item
    from order_items oi join orders o on o.id = oi.order_id
   where oi.id = p_item_id;

  if v_item is null then raise exception 'NOT_FOUND'; end if;

  if current_restaurant() is null or v_item.restaurant_id <> current_restaurant() then
    raise exception 'FORBIDDEN' using detail = 'that ticket belongs to another restaurant';
  end if;

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

  -- Scalar aggregate, no GROUP BY: returns 0 rather than no row when every item is
  -- voided, so the bill actually goes to zero instead of silently keeping its total.
  select coalesce(sum(unit_price_cents * qty), 0)::int
    into v_subtotal
    from order_items
   where order_id = v_item.order_id and status <> 'voided';

  select tax_rate into v_tax_rate from restaurants where id = v_item.restaurant_id;

  update orders
     set subtotal_cents = v_subtotal,
         tax_cents      = round(v_subtotal * coalesce(v_tax_rate, 0)),
         total_cents    = v_subtotal + round(v_subtotal * coalesce(v_tax_rate, 0))
   where id = v_item.order_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. place_order() — the dishes were never checked against the restaurant.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Reproduced: a guest posted an order naming restaurant B with one of Brigade's dish
-- ids. It succeeded — the order was booked to B at Brigade's price, and the depletion
-- came out of BRIGADE's pantry. B's kitchen saw a docket for food Brigade paid for, and
-- Brigade's KDS never saw the ticket that consumed it.
--
-- The whole body is restated because that is what `create or replace function` requires.
-- The ONLY change from migration 009 is the new check marked (006) below; the locking
-- comments and ordering are load-bearing and are preserved verbatim.

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

  ------------------------------------------------------------------
  -- (006) Every dish must be on THIS restaurant's menu.
  --
  -- Without this the function is a cross-tenant depletion primitive: name any
  -- restaurant, pass another one's dish ids, and the second restaurant's pantry pays
  -- for it. Also rejects dish ids that do not exist at all, which previously produced
  -- an order with no items and a zero total.
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. profiles_update_self pinned role and restaurant_id — but not station.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Reproduced: grill@brigade.test PATCHed their own profile to station 'saute' (204),
-- then fired a sauté ticket. `role: 'owner'` was correctly refused with a 403, so the
-- policy works — station was simply not in it.
--
-- patch 003 added the station gate to advance_item_status() and the docs say "a chef de
-- partie works THEIR station". That guarantee was bypassable by the person it gates.
-- Station is a rota decision; it belongs to the owner-only policy.

drop policy if exists profiles_update_self on profiles;

create policy profiles_update_self on profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role is not distinct from (select p.role from profiles p where p.id = auth.uid())
    and restaurant_id is not distinct from (select p.restaurant_id from profiles p where p.id = auth.uid())
    and station is not distinct from (select p.station from profiles p where p.id = auth.uid())
  );

comment on policy profiles_update_self on profiles is
  'A person may edit their own name and phone. Role, restaurant and station are not self-service — each is a permission, and station gates which tickets they can fire.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. recipe_items_read was is_staff() with no tenant filter.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Reproduced: a second restaurant with zero dishes of its own read all 70 of Brigade's
-- BOM rows, quantities included. patch 003 closed this for guests and left it open to
-- every other restaurant's staff — and a recipe is the one thing a restaurant most
-- wants kept from a competitor.

drop policy if exists recipe_items_read on recipe_items;

create policy recipe_items_read on recipe_items
  for select using (
    is_staff()
    and exists (
      select 1 from dishes d
       where d.id = recipe_items.dish_id
         and d.restaurant_id = current_restaurant()
    )
  );

commit;

-- Verify:
--   -- no view is writable, with the publishable key and no session:
--   PATCH /rest/v1/reservation_load?limit=0  {}   -->  403
--   -- a chef cannot move stock through a view:
--   PATCH /rest/v1/ingredients_public?id=eq.<x>  {"stock_qty":999}  -->  403
--   -- a chef cannot re-station themselves:
--   PATCH /rest/v1/profiles?id=eq.<self>  {"station":"saute"}  -->  403
--   -- voiding the only item on an order zeroes the bill:
--   select subtotal_cents, total_cents from orders where id = '<order>';  -->  0, 0
--
-- Asserted mechanically in scripts/sql-check.sh and end to end in
-- scripts/verify-features.mjs ("Going around the app").
