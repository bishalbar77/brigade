/**
 * Concatenates supabase/migrations/*.sql into one file for pasting into the
 * Supabase SQL editor.
 *
 * Exists because a current Supabase project's direct DB host is IPv6-only and the
 * pooled host is region-specific, so `psql` needs a connection string copied from
 * the dashboard. The SQL editor needs nothing but a paste, which is one less thing
 * to go wrong at midnight.
 *
 *   npm run sql:bundle
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";
const OUT = "supabase/apply_all.sql";

// Lexicographic order is the intended order: '_' (0x5F) sorts before 'b' (0x62),
// so 010_rls.sql correctly precedes 010b_column_grants.sql.
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

const parts = [
  `-- Brigade — all migrations, concatenated. GENERATED FILE, do not edit.`,
  `-- Regenerate with: npm run sql:bundle`,
  `--`,
  `-- Paste into the Supabase SQL editor and run once. Order matters: enums and`,
  `-- helper functions must exist before the policies that reference them.`,
  `--`,
  `-- Files, in order:`,
  ...files.map((f, i) => `--   ${String(i + 1).padStart(2, "0")}. ${f}`),
  ``,
  `begin;`,
  ``,
  `-- Fail fast with a readable message if this has already been applied, rather`,
  `-- than a confusing "type app_role already exists" from halfway down.`,
  `do $guard$`,
  `begin`,
  `  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'restaurants') then`,
  `    raise exception 'Brigade schema is already applied — nothing to do.'`,
  `      using hint = 'To reapply from scratch: drop schema public cascade; create schema public; then re-run.';`,
  `  end if;`,
  `end`,
  `$guard$;`,
  ``,
];

for (const file of files) {
  parts.push(
    `-- ${"=".repeat(74)}`,
    `-- ${file}`,
    `-- ${"=".repeat(74)}`,
    ``,
    readFileSync(join(MIGRATIONS, file), "utf8").trim(),
    ``,
  );
}

parts.push(`commit;`, ``);

writeFileSync(OUT, parts.join("\n"));
console.log(`Wrote ${OUT} from ${files.length} migrations:`);
for (const f of files) console.log(`  ${f}`);
