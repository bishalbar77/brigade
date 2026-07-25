/**
 * Static checks on SQL, for the defect classes a server does NOT reject.
 *
 *   npm run sql:lint      (fast, no database)
 *   npm run sql:check     (authoritative — actually executes it)
 *
 * Run this first because it's instant. `sql:check` is the ground truth, but spinning a
 * cluster takes a few seconds and there's no reason to wait for that to be told about a
 * reserved word.
 *
 * Every rule here comes from a defect that actually shipped, or from a pattern that
 * executes cleanly while doing nothing. Rules with no history behind them are noise, so
 * there aren't any.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Words Postgres will not accept as a bare column name in a RETURNS TABLE clause. */
const RESERVED = new Set([
  "position", "order", "user", "table", "column", "all", "any", "array", "case", "cast",
  "check", "constraint", "default", "desc", "asc", "distinct", "do", "else", "end",
  "except", "false", "for", "from", "grant", "group", "having", "in", "initially",
  "intersect", "into", "limit", "not", "null", "offset", "on", "only", "or", "primary",
  "references", "returning", "select", "some", "symmetric", "true", "union", "unique",
  "using", "when", "where", "window", "with", "authorization", "binary", "collate",
  "concurrently", "cross", "current_date", "current_time", "current_timestamp", "full",
  "ilike", "inner", "is", "isnull", "join", "later", "left", "like", "natural", "notnull",
  "outer", "overlaps", "right", "similar", "verbose",
]);

const files = [];
for (const dir of ["supabase/migrations", "supabase/patches"]) {
  try {
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith(".sql") && f !== "apply_all.sql" && f !== "apply_pending.sql") {
        files.push(join(dir, f));
      }
    }
  } catch {
    /* directory may not exist */
  }
}

const problems = [];
const note = (file, line, rule, message) => problems.push({ file, line, rule, message });

/** Strip comments and string literals so patterns don't match prose. */
function stripNoise(sql) {
  return sql
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/'(?:[^']|'')*'/g, (m) => `'${" ".repeat(Math.max(0, m.length - 2))}'`);
}

const lineOf = (sql, index) => sql.slice(0, index).split("\n").length;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const sql = stripNoise(raw);

  // ── 1. Reserved word as a RETURNS TABLE out-column.
  // Shipped once: `returns table (queue_id uuid, position int, ...)` → syntax error.
  for (const m of sql.matchAll(/returns\s+table\s*\(([^)]*)\)/gi)) {
    for (const col of m[1].split(",")) {
      const name = col.trim().split(/\s+/)[0]?.toLowerCase();
      if (name && RESERVED.has(name)) {
        note(file, lineOf(sql, m.index), "reserved-out-column",
          `"${name}" is reserved and cannot name a RETURNS TABLE column. Rename it.`);
      }
    }
  }

  // ── 2. A cast or volatile call inside an index expression.
  // Shipped once: index on (created_at::date) → "functions in index expression must be
  // marked IMMUTABLE", because timestamptz→date depends on the session TimeZone.
  for (const m of sql.matchAll(/create\s+(?:unique\s+)?index[\s\S]{0,400}?;/gi)) {
    const body = m[0];
    if (/\(\s*[a-z_.]+\s*::\s*date\s*\)/i.test(body) || /\bnow\s*\(\s*\)/i.test(body)) {
      note(file, lineOf(sql, m.index), "index-not-immutable",
        "Index expression uses a cast/now() that is STABLE, not IMMUTABLE. Postgres will reject it. Store the derived value in a column instead.");
    }
  }

  // ── 3. Column-level REVOKE with no matching table-level REVOKE.
  // EXECUTES CLEANLY AND DOES NOTHING when a table-wide grant exists — which it does on
  // Supabase, where `authenticated` is granted table-level UPDATE by default. Verified:
  // has_column_privilege stayed true after the column revoke.
  for (const m of sql.matchAll(/revoke\s+(\w+)\s*\(([^)]+)\)\s+on\s+([\w.]+)\s+from\s+(\w+)/gi)) {
    const [, priv, , table, role] = m;
    const tableWide = new RegExp(
      `revoke\\s+${priv}\\s+on\\s+${table.replace(".", "\\.")}\\s+from\\s+${role}`, "i",
    );
    if (!tableWide.test(sql)) {
      note(file, lineOf(sql, m.index), "noop-column-revoke",
        `Column-level REVOKE ${priv} on ${table} from ${role} is a NO-OP while a table-wide grant exists. Revoke ${priv} on the table, then re-grant the columns you still want writable.`);
    }
  }

  // ── 4. A view over a table with RLS, created without an explicit security mode.
  // Silently runs as owner and bypasses RLS. That is how dish_binding_ingredient came to
  // leak exact pantry stock to anonymous callers.
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(\w+)([\s\S]{0,200}?)\bas\b/gi)) {
    const [, name, between] = m;
    if (!/security_invoker/i.test(between)) {
      note(file, lineOf(sql, m.index), "view-security-mode",
        `View "${name}" declares no security mode, so it runs as OWNER and bypasses RLS. That is correct only if it re-imposes tenancy itself (e.g. a current_restaurant() filter) — confirm it does, or add security_invoker = true.`);
    }
  }

  // ── 5. A transaction that never commits.
  const begins = (sql.match(/^\s*begin\s*;/gim) ?? []).length;
  const commits = (sql.match(/^\s*commit\s*;/gim) ?? []).length;
  if (begins !== commits) {
    note(file, 1, "unbalanced-transaction",
      `${begins} BEGIN vs ${commits} COMMIT. An unclosed transaction leaves the editor session open and the changes uncommitted.`);
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const WARN_ONLY = new Set(["view-security-mode"]);
const errors = problems.filter((p) => !WARN_ONLY.has(p.rule));
const warnings = problems.filter((p) => WARN_ONLY.has(p.rule));

console.log(`sql-lint: ${files.length} files\n`);

if (errors.length === 0 && warnings.length === 0) {
  console.log("  ✔ nothing to flag");
} else {
  for (const group of [
    ["ERROR", errors],
    ["review", warnings],
  ]) {
    const [label, list] = group;
    if (list.length === 0) continue;
    console.log(`  ${label}:`);
    for (const p of list) {
      console.log(`    ${p.file}:${p.line}  [${p.rule}]`);
      console.log(`      ${p.message}`);
    }
    console.log();
  }
}

if (errors.length > 0) {
  console.log(`✖ ${errors.length} error(s). These will fail or silently do nothing.`);
  process.exit(1);
}
console.log(
  warnings.length > 0
    ? `\n${warnings.length} item(s) to eyeball. Run \`npm run sql:check\` for the authoritative pass.`
    : "\nRun `npm run sql:check` for the authoritative pass (it executes everything).",
);
