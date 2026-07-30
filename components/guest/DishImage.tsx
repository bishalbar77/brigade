import Image from "next/image";

/*
 * A dish photograph, or a deliberate stand-in for one.
 *
 * The fallback is not decoration. 28 curated photos will not cover the 29th dish
 * someone adds, and a card that collapses to a different height when a photo is
 * missing makes the whole grid ragged — which looks more broken than a missing photo
 * does. So every card occupies the same 16:9 block whether or not there is an image.
 *
 * The stand-in is DETERMINISTIC: the same dish always gets the same gradient, so the
 * menu doesn't shuffle its own appearance between renders. It is built only from
 * existing palette tokens, because this component was added to the design system, not
 * alongside it.
 *
 * `data-dish-media` is a test hook. scripts/verify-features.mjs asserts every card
 * renders one of the two states and — the failure that actually matters — that none
 * renders neither.
 */

/** Palette tokens the stand-in may tint with. Warm first: this is a menu. */
const TINTS = [
  "--color-warn",
  "--color-danger",
  "--color-runway-plenty",
  "--color-accent",
] as const;

/**
 * FNV-1a, so the tint is stable across processes.
 *
 * `String.prototype.hashCode` doesn't exist and `Math.random` would reshuffle the menu
 * on every render, including between the server and the client — which React reports
 * as a hydration mismatch.
 */
function tintFor(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return TINTS[hash % TINTS.length]!;
}

export function DishImage({
  name,
  imageUrl,
  category,
  /** The dish page shows one large photo; a card shows a small one. */
  size = "card",
  priority = false,
}: {
  name: string;
  imageUrl: string | null;
  category?: string | null;
  size?: "card" | "hero";
  priority?: boolean;
}) {
  const hero = size === "hero";

  return (
    <div
      data-dish-media={imageUrl ? "photo" : "fallback"}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: hero ? "3 / 2" : "16 / 9",
        // Behind the photo while it loads, so the card never flashes white in a dim
        // room — and the same surface the stand-in is built from.
        background: "var(--color-bg-sunken)",
        overflow: "hidden",
      }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          // Empty on purpose: the dish name is in the heading immediately beside this,
          // so alt text here would make a screen reader say it twice.
          alt=""
          fill
          sizes={hero ? "(max-width: 40rem) 100vw, 40rem" : "(max-width: 40rem) 100vw, 20rem"}
          priority={priority}
          style={{ objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "flex-end",
            padding: "var(--space-3) var(--space-4)",
            background: `
              radial-gradient(120% 90% at 18% 8%,
                color-mix(in oklab, var(${tintFor(name)}) 26%, transparent) 0%,
                transparent 62%),
              linear-gradient(155deg,
                var(--color-bg-raised) 0%,
                var(--color-bg-sunken) 100%)`,
          }}
        >
          {category && (
            <span className="eyebrow" style={{ color: "var(--color-fg-subtle)" }}>
              {category}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
