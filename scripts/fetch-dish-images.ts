/**
 * Populate dish photography from Wikimedia Commons.
 *
 *   npm run images
 *   npm run images -- --force     # re-download even if the object is already there
 *
 * What it does, and why in this order:
 *
 *   1. Resolves each CURATED file title (supabase/seed/dish-images.ts) through the
 *      Commons API, capturing a 900px thumbnail URL plus the author, the licence and
 *      the file page — the three things CC BY and CC BY-SA require you to carry.
 *   2. Downloads it and RE-HOSTS it in a public Supabase Storage bucket. Never
 *      hotlinked: a running restaurant must not depend on Commons being reachable,
 *      and Wikimedia asks people not to use them as a CDN.
 *   3. Writes the storage URL into `dishes.image_url`.
 *   4. Emits docs/image-credits.md and lib/data/image-credits.ts — the doc for the
 *      repo, the module so the dish page can show the credit to an actual reader.
 *      Attribution nobody can see is not attribution.
 *
 * Idempotent. An object already in the bucket is not re-downloaded, so a re-run is
 * cheap and Commons is hit once per photo per machine. Uses the service-role key
 * (Storage admin + a write that bypasses RLS), which is why this is a script and
 * never app code.
 *
 * Failures are per-dish and non-fatal: a dish whose photo cannot be fetched keeps
 * `image_url` null and renders the deterministic gradient. One unreachable file must
 * not leave the menu half-illustrated.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import ws from "ws";
import { DISHES } from "../supabase/seed/data";
import { DISH_IMAGES, IMAGE_BUCKET, imageObjectPath } from "../supabase/seed/dish-images";

const RESTAURANT_SLUG = "brigade-demo";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const THUMB_WIDTH = 900;

/**
 * Wikimedia asks for a descriptive User-Agent with a way to reach the operator, and
 * throttles hard without one. Measured while building this: six unthrottled requests
 * in a row earned a plain-text "You are making too many requests to the API."
 */
const USER_AGENT = "Brigade/0.1 (restaurant ops demo; +https://github.com/bishalbar77/brigade)";
const COMMONS_DELAY_MS = 1500;

const force = process.argv.includes("--force");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Copy .env.example to .env.local and fill both from the Supabase dashboard.",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false },
  // Same reason as the seed: supabase-js builds a RealtimeClient in its constructor
  // and native WebSocket only exists from Node 22. No channel is ever opened here.
  realtime: { transport: ws as never },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry a flaky remote call.
 *
 * Measured while building this: one of 28 Storage uploads returned a bare "Bad
 * Request" and the identical upload succeeded seconds later. Without a retry that
 * flake leaves a dish permanently unillustrated and reads as a curation mistake, so
 * it is worth three attempts before believing it.
 */
async function retrying<T>(
  label: string,
  attempts: number,
  fn: () => Promise<{ ok: true; value: T } | { ok: false; why: string }>,
): Promise<{ ok: true; value: T } | { ok: false; why: string }> {
  let last = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(1500 * i);
    const result = await fn();
    if (result.ok) return result;
    last = result.why;
    if (i < attempts - 1) console.warn(`    ${label} failed (${last}), retrying`);
  }
  return { ok: false, why: last };
}

export interface Credit {
  dish: string;
  /** Commons file title, so the map and the credit can be reconciled by eye. */
  file: string;
  author: string;
  licence: string;
  /** File description page — the canonical "source" for attribution. */
  source: string;
  licenceUrl: string | null;
}

/** extmetadata values are HTML fragments: `<a href="…"><bdi>Name</bdi></a>`. */
function plain(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Resolved {
  thumbUrl: string;
  mime: string;
  credit: Omit<Credit, "dish" | "file">;
}

/**
 * One Commons lookup, with backoff.
 *
 * The throttle response is PLAIN TEXT, not JSON, so a bare `res.json()` throws a
 * SyntaxError that reads like a bug in this script rather than a rate limit. Parse
 * the text ourselves and retry on anything unparseable.
 */
async function resolveFile(fileTitle: string): Promise<Resolved | null> {
  const api = new URL(COMMONS_API);
  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("titles", fileTitle);
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url|mime|extmetadata");
  api.searchParams.set("iiurlwidth", String(THUMB_WIDTH));

  let payload: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(5000 * attempt);
    const res = await fetch(api, { headers: { "User-Agent": USER_AGENT } });
    const text = await res.text();
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
      break;
    } catch {
      console.warn(`    commons throttled or unparseable, retrying: ${text.slice(0, 60)}`);
    }
  }
  if (!payload) return null;

  const query = payload.query as { pages?: Record<string, unknown> } | undefined;
  const page = Object.values(query?.pages ?? {})[0] as
    | {
        missing?: string;
        title?: string;
        imageinfo?: {
          thumburl?: string;
          url?: string;
          mime?: string;
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string }>;
        }[];
      }
    | undefined;

  if (!page || page.missing !== undefined) {
    console.warn(`    no such file on Commons: ${fileTitle}`);
    return null;
  }

  const info = page.imageinfo?.[0];
  const thumbUrl = info?.thumburl ?? info?.url;
  if (!thumbUrl) {
    console.warn(`    no image info for ${fileTitle}`);
    return null;
  }

  const md = info?.extmetadata ?? {};
  return {
    thumbUrl,
    mime: info?.mime ?? "image/jpeg",
    credit: {
      // "Unknown" rather than "" — a blank author line reads like a rendering bug,
      // and Commons genuinely has files whose author field is empty.
      author: plain(md.Artist?.value) || "Unknown",
      licence: plain(md.LicenseShortName?.value) || "See source",
      source: info?.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`,
      licenceUrl: plain(md.LicenseUrl?.value) || null,
    },
  };
}

async function ensureBucket(): Promise<void> {
  const { data: buckets, error } = await db.storage.listBuckets();
  if (error) throw new Error(`storage: ${error.message}`);
  if (buckets?.some((b) => b.name === IMAGE_BUCKET)) return;

  const { error: cErr } = await db.storage.createBucket(IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: "4MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (cErr) throw new Error(`storage: create ${IMAGE_BUCKET}: ${cErr.message}`);
  console.log(`  created public bucket ${IMAGE_BUCKET}`);
}

async function existingObjects(): Promise<Set<string>> {
  const { data } = await db.storage.from(IMAGE_BUCKET).list("", { limit: 1000 });
  return new Set((data ?? []).map((o) => o.name));
}

async function main() {
  console.log("Dish photography from Wikimedia Commons\n");

  await ensureBucket();
  const present = await existingObjects();
  console.log(`  ${present.size} object(s) already in the bucket\n`);

  const { data: restaurant, error: rErr } = await db
    .from("restaurants")
    .select("id")
    .eq("slug", RESTAURANT_SLUG)
    .single();
  if (rErr || !restaurant) throw new Error(`no restaurant ${RESTAURANT_SLUG}: ${rErr?.message}`);

  const credits: Credit[] = [];
  const skipped: string[] = [];
  let fetched = 0;
  let reused = 0;

  for (const dish of DISHES) {
    const fileTitle = DISH_IMAGES[dish.name];
    if (!fileTitle) {
      skipped.push(`${dish.name} (not in the curated map)`);
      continue;
    }

    const objectPath = imageObjectPath(dish.name);
    const alreadyThere = present.has(objectPath) && !force;

    // The credit is needed even when the bytes are cached, so the lookup happens
    // either way — it is one small JSON call, and attribution must not go stale.
    const resolved = await resolveFile(fileTitle);
    await sleep(COMMONS_DELAY_MS);

    if (!resolved) {
      skipped.push(`${dish.name} (could not resolve ${fileTitle})`);
      continue;
    }

    // The storage path is always .jpg because the seed derives it from the dish name
    // alone. Anything other than a JPEG would make that path a lie, so refuse it
    // rather than serve a PNG from a .jpg URL.
    if (resolved.mime !== "image/jpeg") {
      skipped.push(`${dish.name} (${resolved.mime}, expected image/jpeg)`);
      continue;
    }

    if (alreadyThere) {
      reused++;
      console.log(`  = ${dish.name}`);
    } else {
      const download = await retrying(`${dish.name} download`, 3, async () => {
        const res = await fetch(resolved.thumbUrl, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) return { ok: false as const, why: `HTTP ${res.status}` };
        return { ok: true as const, value: new Uint8Array(await res.arrayBuffer()) };
      });
      if (!download.ok) {
        skipped.push(`${dish.name} (download: ${download.why})`);
        continue;
      }
      const bytes = download.value;

      const upload = await retrying(`${dish.name} upload`, 3, async () => {
        const { error } = await db.storage
          .from(IMAGE_BUCKET)
          .upload(objectPath, bytes, { contentType: "image/jpeg", upsert: true });
        return error ? { ok: false as const, why: error.message } : { ok: true as const, value: true };
      });
      if (!upload.ok) {
        skipped.push(`${dish.name} (upload: ${upload.why})`);
        continue;
      }
      fetched++;
      console.log(`  + ${dish.name}  ${(bytes.length / 1024).toFixed(0)} kB`);
    }

    const publicUrl = db.storage.from(IMAGE_BUCKET).getPublicUrl(objectPath).data.publicUrl;
    const { error: dErr } = await db
      .from("dishes")
      .update({ image_url: publicUrl })
      .eq("restaurant_id", restaurant.id)
      .eq("name", dish.name);
    if (dErr) {
      skipped.push(`${dish.name} (image_url: ${dErr.message})`);
      continue;
    }

    credits.push({ dish: dish.name, file: fileTitle, ...resolved.credit });
  }

  await writeCredits(credits);

  console.log(
    `\n  ${fetched} downloaded, ${reused} reused, ${credits.length}/${DISHES.length} dishes illustrated`,
  );
  if (skipped.length > 0) {
    console.log("\n  Not illustrated (these render the gradient fallback, which is fine):");
    for (const s of skipped) console.log(`    - ${s}`);
  }
  console.log("\n  Wrote docs/image-credits.md and lib/data/image-credits.ts");
}

async function writeCredits(credits: Credit[]) {
  const sorted = [...credits].sort((a, b) => a.dish.localeCompare(b.dish));

  const md = [
    "# Image credits",
    "",
    "Every dish photograph on the Brigade menu comes from **Wikimedia Commons** and is",
    "re-hosted in Supabase Storage. Each is a photograph of the dish it illustrates,",
    "chosen by hand — see `supabase/seed/dish-images.ts` for the curated map and",
    "`scripts/fetch-dish-images.ts` for the fetch.",
    "",
    "CC BY and CC BY-SA require attribution, so this list is generated from the Commons",
    "API rather than written by hand, and the same data is rendered beside each photo in",
    "the app at [/credits](../app/(guest)/credits/page.tsx).",
    "",
    "**This file is generated. Run `npm run images` to refresh it.**",
    "",
    "| Dish | Author | Licence | Source |",
    "|---|---|---|---|",
    ...sorted.map(
      (c) =>
        `| ${c.dish} | ${c.author} | ${c.licence} | [${c.file.replace(/^File:/, "")}](${c.source}) |`,
    ),
    "",
    `_${sorted.length} photographs._`,
    "",
  ].join("\n");

  await writeFile("docs/image-credits.md", md, "utf8");

  const ts = [
    "/**",
    " * GENERATED by scripts/fetch-dish-images.ts — do not edit by hand.",
    " *",
    " * Attribution for the dish photography, as a module rather than only a markdown",
    " * file, because CC BY-SA requires the credit to travel with the image where a",
    " * reader can see it. The dish page shows the author and licence; /credits lists",
    " * every photograph.",
    " */",
    "",
    "export interface ImageCredit {",
    "  dish: string;",
    "  author: string;",
    "  licence: string;",
    "  source: string;",
    "  licenceUrl: string | null;",
    "}",
    "",
    "export const IMAGE_CREDITS: readonly ImageCredit[] = [",
    ...sorted.map(
      (c) =>
        `  { dish: ${JSON.stringify(c.dish)}, author: ${JSON.stringify(c.author)}, ` +
        `licence: ${JSON.stringify(c.licence)}, source: ${JSON.stringify(c.source)}, ` +
        `licenceUrl: ${JSON.stringify(c.licenceUrl)} },`,
    ),
    "];",
    "",
    "const BY_DISH = new Map(IMAGE_CREDITS.map((c) => [c.dish, c]));",
    "",
    "export function creditFor(dishName: string): ImageCredit | null {",
    "  return BY_DISH.get(dishName) ?? null;",
    "}",
    "",
  ].join("\n");

  await writeFile("lib/data/image-credits.ts", ts, "utf8");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
