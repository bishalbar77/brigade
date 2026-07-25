-- 007 — intelligence
-- All deterministic. No LLM anywhere in this product (ADR-7).

-- Materialised velocity, refreshed after each service rather than computed per request.
create table dish_velocity (
  dish_id             uuid not null references dishes on delete cascade,
  weekday             int  not null check (weekday between 0 and 6),
  daypart             text not null,
  ewma_units_per_hour numeric(10,4) not null default 0,
  sample_count        int  not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (dish_id, weekday, daypart)
);

create table insights (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants on delete cascade,
  kind            text not null,       -- runway_critical | reorder | variance | menu_dog | forecast_peak
  severity        int  not null default 1 check (severity between 1 and 3),
  title           text not null,
  -- title/body exist so a narration layer could be added later without touching
  -- any of the maths. That seam is intentional.
  body            text not null default '',
  payload         jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);

create index insights_restaurant_idx on insights (restaurant_id, created_at desc);

-- Dedupe key: one insight per kind per subject per service, so a dish oscillating
-- across the critical boundary can't emit a notification storm.
create unique index insights_dedupe_idx on insights (
  restaurant_id, kind, (payload->>'subject_id'), (created_at::date)
) where acknowledged_at is null;

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null default '',
  deep_link    text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_idx on notifications (recipient_id, created_at desc);
create index notifications_unread_idx on notifications (recipient_id) where read_at is null;

create table audit_log (
  id         bigserial primary key,
  actor_id   uuid references profiles on delete set null,
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);
