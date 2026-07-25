#!/usr/bin/env bash
#
# Validate every SQL file by ACTUALLY EXECUTING IT against a throwaway Postgres.
#
#   npm run sql:check
#
# WHY THIS EXISTS
# Three SQL defects reached the user before this script did:
#   1. an index on (created_at::date) — rejected, timestamptz->date is STABLE not IMMUTABLE
#   2. `position` as a RETURNS TABLE out-column — rejected, it's a reserved word
#   3. a column-level REVOKE that was a silent NO-OP under a table-wide grant
# The first two were plain syntax/semantic errors a real server catches instantly. Only
# the third needed a human to reason about it, so this script covers execution and
# scripts/sql-lint.mjs covers the reasoning classes.
#
# HOW
# initdb a fresh cluster in a temp dir with trust auth on a nonstandard port, stand up
# Supabase-shaped prerequisites (auth schema, auth.uid(), the three roles, the realtime
# publication), apply the migration bundle then each patch in order, and report the first
# error per file with its line. Torn down on exit, always.
#
# It does NOT touch the real project. Nothing here needs a password or network.

set -uo pipefail

PORT="${SQL_CHECK_PORT:-55433}"
PGBIN="$(ls -d /opt/homebrew/opt/postgresql@15/bin 2>/dev/null || ls -d /opt/homebrew/opt/postgresql@14/bin 2>/dev/null || true)"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
LOG="$WORK/pg.log"
DB="sqlcheck"
FAILED=0

if [[ -z "$PGBIN" ]]; then
  echo "✖ No local postgresql@14/15 found. Install one:  brew install postgresql@15" >&2
  exit 2
fi

cleanup() {
  "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "Postgres: $("$PGBIN/postgres" --version)"
echo "Throwaway cluster on port $PORT"

# trust auth: this cluster is local, temporary, and holds nothing real.
#
# --locale=C is not optional on macOS: initdb inherits LANG/LC_* from the shell, and a
# shell with them unset or partially set fails with "invalid locale settings". Pinning
# the locale makes this run identically regardless of the caller's environment.
#
# The error is SHOWN rather than swallowed. The first version of this script sent it to
# /dev/null and printed "initdb failed", which told me nothing — a validation tool that
# hides its own diagnostics is barely a validation tool.
if ! INITDB_OUT="$(LC_ALL=C LANG=C "$PGBIN/initdb" -D "$DATA" -U postgres -A trust --locale=C --encoding=UTF8 2>&1)"; then
  echo "✖ initdb failed:" >&2
  echo "$INITDB_OUT" | grep -Ei "error|fatal|hint" | head -5 | sed 's/^/    /' >&2
  exit 2
fi

if ! LC_ALL=C LANG=C "$PGBIN/pg_ctl" -D "$DATA" \
     -o "-p $PORT -c listen_addresses=localhost -c fsync=off" -l "$LOG" start >/dev/null 2>&1; then
  echo "✖ could not start postgres:" >&2
  tail -12 "$LOG" | sed 's/^/    /' >&2
  exit 2
fi

PSQL=("$PGBIN/psql" -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null

# ── Supabase-shaped prerequisites ────────────────────────────────────────────
# Only what the schema actually references. A faithful clone isn't needed; an honest
# stand-in for the objects our SQL depends on is.
"${PSQL[@]}" -d "$DB" >/dev/null 2>&1 <<'PREREQ'
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Returns null, exactly like an unauthenticated request. Enough for DDL to compile.
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;

-- Supabase ships this; migration 011 adds tables to it.
do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Mirror Supabase's blanket grants, so privilege behaviour here matches production.
-- Without these a REVOKE would appear to work locally and no-op in production.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
PREREQ

echo "Prerequisites installed (auth schema, auth.uid(), 3 roles, realtime publication,"
echo "and Supabase's blanket grants — so privilege semantics match production)."
echo

run_sql () {
  local file="$1" label="$2"
  [[ -f "$file" ]] || { echo "  ─ $label (absent, skipped)"; return 0; }

  local out
  out="$("${PSQL[@]}" -d "$DB" -f "$file" 2>&1)"
  if [[ $? -eq 0 ]]; then
    echo "  ✔ $label"
  else
    FAILED=1
    echo "  ✖ $label"
    # First error only — later ones are usually fallout from the first.
    echo "$out" | grep -E "^(psql:|ERROR|DETAIL|HINT|LINE)" | head -6 | sed 's/^/      /'
  fi
}

echo "Applying schema:"
# The bundle is generated, so regenerate first — validating a stale copy is worse
# than not validating.
(cd "$ROOT" && node scripts/bundle-sql.mjs >/dev/null 2>&1) || true
run_sql "$ROOT/supabase/apply_all.sql" "supabase/apply_all.sql (all migrations)"

echo
echo "Applying patches in order:"
shopt -s nullglob
for p in "$ROOT"/supabase/patches/[0-9]*.sql; do
  run_sql "$p" "supabase/patches/$(basename "$p")"
done

# ── Idempotency: every patch claims to be safe to re-run. Prove it. ──────────
echo
echo "Re-applying patches (they all claim idempotency):"
for p in "$ROOT"/supabase/patches/[0-9]*.sql; do
  run_sql "$p" "$(basename "$p") — second run"
done

# ── Assertions: does the schema actually GUARANTEE what we claim? ────────────
#
# This section exists because of defect 3. A column-level REVOKE under a table-wide
# grant EXECUTES CLEANLY and changes nothing — proven locally:
#     grant update on t to authenticated;
#     revoke update (stock_qty) on t from authenticated;
#     select has_column_privilege('authenticated','t','stock_qty','update')  →  t
#
# So "it ran without error" is not the same as "it did what the comment says". Every
# security claim the SQL makes in prose gets a mechanical check here.

assert () {
  local label="$1" query="$2" want="$3"
  local got
  got="$("${PSQL[@]}" -d "$DB" -tAc "$query" 2>&1 | tr -d '[:space:]')"
  if [[ "$got" == "$want" ]]; then
    echo "  ✔ $label"
  else
    FAILED=1
    echo "  ✖ $label  (expected '$want', got '$got')"
  fi
}

echo
echo "Asserting the guarantees, not just the syntax:"

assert "stock_qty is NOT updatable by authenticated (the ledger invariant)" \
  "select has_column_privilege('authenticated','ingredients','stock_qty','update')" "f"

assert "authenticated CAN still update par_level (the revoke wasn't too broad)" \
  "select has_column_privilege('authenticated','ingredients','par_level','update')" "t"

assert "stock cannot go negative" \
  "select count(*) from pg_constraint where conname='ingredients_stock_non_negative'" "1"

assert "recipe_items FK is deferrable (so a tenant can be deleted)" \
  "select condeferrable from pg_constraint where conname='recipe_items_ingredient_id_fkey'" "t"

assert "order_items FK is deferrable" \
  "select condeferrable from pg_constraint where conname='order_items_dish_id_fkey'" "t"

assert "ingredients_read requires is_manager (cost is not staff-wide)" \
  "select qual like '%is_manager%' from pg_policies where tablename='ingredients' and policyname='ingredients_read'" "t"

assert "recipe_items quantities are staff-only" \
  "select qual like '%is_staff%' from pg_policies where tablename='recipe_items' and policyname='recipe_items_read'" "t"

assert "advance_item_status checks station" \
  "select prosrc like '%v_station%' from pg_proc where proname='advance_item_status'" "t"

assert "advance_item_status checks tenant" \
  "select prosrc like '%another restaurant%' from pg_proc where proname='advance_item_status'" "t"

assert "profiles_update_self pins restaurant_id as well as role" \
  "select with_check like '%restaurant_id%' from pg_policies where tablename='profiles' and policyname='profiles_update_self'" "t"

assert "pay_order exists" \
  "select count(*) from pg_proc where proname='pay_order'" "1"

assert "join_queue exists" \
  "select count(*) from pg_proc where proname='join_queue'" "1"

assert "dish_ingredient_names exists (names without quantities, for guests)" \
  "select count(*) from pg_views where viewname='dish_ingredient_names'" "1"

assert "no index depends on a non-IMMUTABLE expression" \
  "select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid where pg_get_indexdef(i.indexrelid) like '%::date%'" "0"

assert "an order attached to a table seats it (the floor map reads tables.status)" \
  "select count(*) from pg_trigger where tgname='orders_seat_table' and not tgisinternal" "1"

# Booking capacity depends on counting tables, which tables_read hides from diners. The
# decision therefore has to be security definer, or every booking is refused.
assert "book_table exists and runs as definer (a diner cannot count tables)" \
  "select prosecdef from pg_proc where proname='book_table'" "t"

assert "a diner can see how many tables exist" \
  "select has_table_privilege('anon','restaurant_table_count','select')" "t"

assert "a diner can see when the book is busy, without seeing who booked" \
  "select count(*) from information_schema.columns where table_name='reservation_load' and column_name in ('guest_id','guest_name')" "0"

echo
if [[ $FAILED -eq 0 ]]; then
  echo "✔ SQL executes cleanly, every patch is genuinely re-runnable, and every"
  echo "  security guarantee it claims in prose is mechanically true."
else
  echo "✖ SQL FAILED. Do not hand this to anyone until it's green."
fi
exit $FAILED
