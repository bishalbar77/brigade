-- 011 — realtime publication
-- One channel per surface, unsubscribed on unmount. Free-tier connection limits
-- are real: a subscription leak on navigation kills realtime for everyone.
--
-- Channels (see docs/02-architecture.md):
--   restaurant:{id}:kds           order_items      → KDS, expo
--   restaurant:{id}:floor         tables, orders   → floor map, host
--   restaurant:{id}:availability  ingredients      → guest menus, runway board
--   order:{id}                    order_items      → that guest's tracking screen

alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table tables;
alter publication supabase_realtime add table queue_entries;
alter publication supabase_realtime add table notifications;

-- ingredients drives availability: when stock moves, dependent dishes' portions
-- change, so guest menus and the runway board recompute from this.
alter publication supabase_realtime add table ingredients;

-- REPLICA IDENTITY FULL so update payloads carry the previous row too — needed to
-- tell "crossed into the critical band" from "was already critical", which is what
-- prevents a notification storm.
alter table order_items    replica identity full;
alter table ingredients    replica identity full;
alter table tables         replica identity full;
alter table queue_entries  replica identity full;
