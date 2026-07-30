"use client";

import { useLinkStatus } from "next/link";

/*
 * "Yes, that tap landed."
 *
 * Sorting the pantry or filtering it is a real navigation on a `force-dynamic` route,
 * and `app/ops/loading.tsx` does NOT re-show for a search-param change — Next treats it
 * as a soft navigation within the same route. So the old screen sat there, complete and
 * stale, with nothing to say a request was in flight. In a kitchen the response to that
 * is to tap again.
 *
 * `useLinkStatus` reports the pending state of the nearest ancestor `<Link>`, so these
 * must be rendered INSIDE the link they describe. That is the whole reason they are
 * separate components: it keeps `Table` and the pages using it as server components and
 * pulls only this into the client bundle.
 *
 * Where a filter could be made instant instead, it was — see KdsBoard's station tabs,
 * which switch with no round trip at all. This is for the links that legitimately keep
 * their state in the URL, so a wall screen can be left on a sorted view.
 *
 * ── A NOTE ON VERIFYING THIS ────────────────────────────────────────────────
 * Same-route search-param navigation does not work under `next start` on the machine
 * this was built on: sorting fails there with a plain `<Link>` too, with no pending
 * child and none of this code — the RSC payload arrives 200 and the transition aborts.
 * The identical code works on the Vercel deployment. So a local failure of sorting or
 * filtering says nothing about this component; check the deployment. Two hours went
 * into concluding, wrongly, that these indicators had broken navigation.
 */

/** A spinner beside a link's label, where there is room for one. */
export function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="spinner"
      style={{ marginLeft: "0.4em", verticalAlign: "-0.1em" }}
    />
  );
}

/**
 * A hairline bar pinned to the bottom of its container.
 *
 * For a link whose label has no room for a spinner — a sortable column header at
 * wall-screen density is already tight. Absolutely positioned and scaled rather than
 * shown/hidden, so it cannot reflow the header row and move the tap target a cook is
 * aiming at.
 */
export function PendingUnderline() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "2px",
        background: "var(--color-accent)",
        transform: pending ? "scaleX(1)" : "scaleX(0)",
        transformOrigin: "left",
        transition: "transform var(--dur-base) var(--ease-out-brigade)",
      }}
    />
  );
}
