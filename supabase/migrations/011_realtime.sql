-- 011 — realtime publication
-- One channel per surface, unsubscribed on unmount. Free-tier connection limits
-- are real: a subscription leak on navigation kills realtime for everyone.
--
-- Channels (see docs/02-architecture.md):
--   restaurant:{id}:kds           order_items      → KDS, expo
--   restaurant:{id}:floor         tables, orders   → floor map, host
--   restaurant:{id}:availability  ingredients      → guest menus, runway board
--   order:{id}                    order_items      → that guest's tracking screen
--
-- Written defensively rather than as bare `alter publication ... add table`,
-- because how Supabase provisions supabase_realtime varies: if it were created
-- FOR ALL TABLES, an explicit add errors out and takes the whole migration with it.

do $$
declare
  v_all_tables boolean;
  v_tbl        text;
begin
  select puballtables into v_all_tables
    from pg_publication
   where pubname = 'supabase_realtime';

  if v_all_tables is null then
    -- unusual on Supabase, but harmless to create
    execute 'create publication supabase_realtime';
    v_all_tables := false;
  end if;

  if v_all_tables then
    raise notice 'supabase_realtime is FOR ALL TABLES — every table is already published';
    return;
  end if;

  for v_tbl in
    select unnest(array[
      'order_items', 'orders', 'tables', 'queue_entries', 'notifications', 'ingredients'
    ])
  loop
    if not exists (
      select 1
        from pg_publication_rel pr
        join pg_publication p on p.oid = pr.prpubid
        join pg_class       c on c.oid = pr.prrelid
       where p.pubname = 'supabase_realtime'
         and c.relname = v_tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tbl);
    end if;
  end loop;
end
$$;

-- REPLICA IDENTITY FULL so update payloads carry the previous row too — needed to
-- tell "crossed into the critical band" from "was already critical", which is what
-- prevents a notification storm.
alter table order_items   replica identity full;
alter table ingredients   replica identity full;
alter table tables        replica identity full;
alter table queue_entries replica identity full;
