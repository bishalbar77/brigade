-- 002 — enums
-- Enums must exist before any table or policy references them.

-- The brigade hierarchy IS the permission model. See docs/03-data-model.md.
create type app_role as enum ('owner', 'manager', 'chef', 'expo', 'server', 'host', 'guest');

create type station as enum ('grill', 'saute', 'larder', 'pastry', 'bar', 'pass');

-- Item-level, not order-level: dishes at one table finish at different times.
create type item_status as enum ('placed', 'fired', 'cooking', 'plated', 'served', 'voided');

create type order_status as enum ('open', 'paid', 'voided');

-- Every stock change carries a reason. There is no "just edit the number".
create type movement_reason as enum ('purchase', 'depletion', 'waste', 'correction', 'count');

create type table_status as enum ('open', 'seated', 'dirty', 'held');

create type reservation_status as enum ('booked', 'seated', 'no_show', 'cancelled');

create type queue_status as enum ('waiting', 'notified', 'seated', 'left');
