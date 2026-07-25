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

/*
 * Patches bundle. These catch up a database that was provisioned from an earlier
 * apply_all.sql; a fresh apply of supabase/migrations/ already contains 001's fix.
 * Each patch is individually idempotent, so the bundle is safe to re-run.
 */
const PATCH_DIR = "supabase/patches";
const PATCH_OUT = "supabase/patches/apply_pending.sql";

const patchFiles = readdirSync(PATCH_DIR)
  .filter((f) => f.endsWith(".sql") && f !== "apply_pending.sql")
  .sort();

if (patchFiles.length) {
  const patchParts = [
    `-- Brigade — all pending patches, concatenated. GENERATED FILE, do not edit.`,
    `-- Regenerate with: npm run sql:bundle`,
    `--`,
    `-- Paste into the Supabase SQL editor and run. Every patch is idempotent, so`,
    `-- re-running this is safe. NOT wrapped in one transaction: each patch already`,
    `-- manages its own, and one failing patch should not roll back the others.`,
    `--`,
    ...patchFiles.map((f, i) => `--   ${String(i + 1).padStart(2, "0")}. ${f}`),
    ``,
  ];

  for (const file of patchFiles) {
    patchParts.push(
      `-- ${"=".repeat(74)}`,
      `-- ${file}`,
      `-- ${"=".repeat(74)}`,
      ``,
      readFileSync(join(PATCH_DIR, file), "utf8").trim(),
      ``,
    );
  }

  writeFileSync(PATCH_OUT, patchParts.join("\n"));
  console.log(`\nWrote ${PATCH_OUT} from ${patchFiles.length} patches:`);
  for (const f of patchFiles) console.log(`  ${f}`);
}
