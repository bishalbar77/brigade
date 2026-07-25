-- 003 — tenancy and identity
-- Multi-tenant from the first migration; retrofitting tenancy is expensive.

create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  timezone      text        not null default 'Europe/London',
  currency      text        not null default 'GBP',
  tax_rate      numeric(5,4) not null default 0.0800 check (tax_rate >= 0 and tax_rate < 1),
  -- { "mon": [["12:00","15:00"],["18:00","22:30"]], ... } — dayparts per weekday
  service_hours jsonb       not null default '{}'::jsonb,
  covers        int         not null default 0,
  created_at    timestamptz not null default now()
);

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  -- nullable: guests are global, staff belong to a restaurant
  restaurant_id uuid        references restaurants on delete set null,
  full_name     text        not null default '',
  phone         text,
  role          app_role    not null default 'guest',
  station       station,
  allergens     text[]      not null default '{}',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

create index profiles_restaurant_idx on profiles (restaurant_id) where restaurant_id is not null;

-- A profile row is created by trigger, not application code, so a user can never
-- exist without one — every RLS policy joins through profiles.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'guest');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
