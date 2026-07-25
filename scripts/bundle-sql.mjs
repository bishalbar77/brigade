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
