"use client";

import { useState } from "react";
import { Spinner } from "@/components/Busy";
import Link from "next/link";
import { useRouter } from "next/navigation";

/*
 * Booking and the walk-in queue, on one screen because they're the same decision:
 * "can I eat here, and when?"
 *
 * The wait quote comes from the server, computed from other parties in the queue and
 * this restaurant's REAL median turn times. It's shown as a RANGE — a precise number
 * that turns out wrong costs more trust than an honest range, and the model has no
 * idea a party will linger over dessert.
 */

export interface Slot {
  iso: string;
  label: string;
  service: "lunch" | "dinner";
  available: boolean;
}

export interface Booking {
  id: string;
  requestedAt: string;
  partySize: number;
  status: string;
}

/**
 * Exact numbers, up to eight.
 *
 * The last option used to read "6+" and send `partySize: 6`. A party of nine tapped
 * "6+", was quietly booked as six, and would have arrived to a table for six — the
 * kind of silent substitution that ruins an evening. Anything above eight needs a
 * human to join tables, so it says so instead of pretending.
 */
const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const SERVICES = [
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
] as const;

export function ReserveView({
  restaurantId,
  days,
  signedIn,
  existingQueue,
  myBookings,
  timeZone,
}: {
  restaurantId: string;
  days: { key: string; label: string; dateLabel: string; slots: Slot[]; closed: boolean }[];
  signedIn: boolean;
  existingQueue: {
    /** Null when it cannot be known — see the note in reserve/page.tsx. */
    position: number | null;
    quotedMinutes: number | null;
    joinedAt: string;
  } | null;
  myBookings: Booking[];
  timeZone: string;
}) {
  const router = useRouter();
  const [party, setParty] = useState(2);
  // Open on the first day that can actually be booked. Defaulting to "Today" means
  // the screen greets a late-evening visitor with an empty grid.
  const [dayKey, setDayKey] = useState(
    () => (days.find((d) => d.slots.some((s) => s.available)) ?? days[0])?.key ?? "",
  );
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [queued, setQueued] = useState<{
    position: number | null;
    quotedMinutes: number | null;
    joinedAt: string;
  } | null>(null);

  const day = days.find((d) => d.key === dayKey) ?? days[0];

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone,
    });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });

  async function book() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, partySize: party, requestedAt: slot }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      setError(body.message ?? "That booking didn't go through.");
      router.refresh();
      return;
    }
    setBooked(slot);
  }

  async function joinQueue() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, partySize: party }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      position?: number;
      quotedMinutes?: number;
    };
    if (!res.ok) {
      setError(body.message ?? "Couldn't join the queue.");
      return;
    }
    // The server DID just tell us the real position, so this is the one moment it can
    // honestly be shown. `?? null` rather than `?? 1`: if the API omitted it, say
    // nothing rather than claim they're next.
    setQueued({
      position: body.position ?? null,
      quotedMinutes: body.quotedMinutes ?? null,
      joinedAt: new Date().toISOString(),
    });
    router.refresh();
  }

  const inQueue = queued ?? existingQueue;

  if (booked) {
    return (
      <section style={{ padding: "var(--space-6) var(--space-4)" }}>
        <h1 style={{ fontSize: "var(--text-step-2)" }}>Table booked</h1>
        <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
          {party} {party === 1 ? "person" : "people"} on {fmtDate(booked)} at {fmtTime(booked)}.
        </p>
        {/* It is now findable again, which it was not: a booking used to disappear on
            reload with nothing to come back to. */}
        <p style={{ color: "var(--color-fg-muted)", marginBottom: "var(--space-4)" }}>
          You&rsquo;ll find this on the booking page whenever you&rsquo;re signed in.
        </p>
        <Link href="/menu" style={{ color: "var(--color-accent)" }}>
          See what&rsquo;s on tonight →
        </Link>
      </section>
    );
  }

  return (
    <section style={{ padding: "var(--space-5) var(--space-4) var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-step-3)" }}>Book a table</h1>
      <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-3) 0 var(--space-5)" }}>
        Or join the queue now and we&rsquo;ll tell you when your table is nearly ready — you
        don&rsquo;t have to wait at the door.
      </p>

      {error && (
        <p
          role="alert"
          style={{
            borderLeft: "3px solid var(--color-runway-critical)",
            background: "var(--color-bg-sunken)",
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
          }}
        >
          {error}
        </p>
      )}

      {inQueue && (
        <div
          style={{
            border: "2px solid var(--color-accent)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
          }}
        >
          <p className="eyebrow">You&rsquo;re in the queue</p>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "var(--text-step-2)",
              margin: "var(--space-2) 0",
            }}
          >
            {/* Only when it is actually known. See the note in reserve/page.tsx. */}
            {inQueue.position !== null
              ? `Position ${inQueue.position}`
              : `Joined at ${fmtTime(inQueue.joinedAt)}`}
          </p>
          {inQueue.quotedMinutes !== null ? (
            <p style={{ color: "var(--color-fg-muted)" }}>
              {/* A RANGE, never a single number. */}
              Roughly {Math.max(5, inQueue.quotedMinutes - 5)}–{inQueue.quotedMinutes + 10} minutes,
              based on how long tables are actually taking tonight.
            </p>
          ) : (
            <p style={{ color: "var(--color-fg-muted)" }}>
              We&rsquo;ll let you know when your table is nearly ready.
            </p>
          )}
        </div>
      )}

      {/* The diner's own bookings. reservations_read_own always allowed this read;
          nothing ever performed it, so a confirmed table left no trace anywhere in the
          app once the success screen was dismissed. */}
      {myBookings.length > 0 && (
        <section style={{ marginBottom: "var(--space-5)" }}>
          <h2 className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
            Your table{myBookings.length === 1 ? "" : "s"}
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}>
            {myBookings.map((b) => (
              <li
                key={b.id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-4)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-bg-raised)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {fmtDate(b.requestedAt)}, {fmtTime(b.requestedAt)}
                </span>
                <span className="eyebrow" style={{ color: "var(--color-fg-muted)" }}>
                  {b.partySize} {b.partySize === 1 ? "person" : "people"}
                  {b.status === "seated" ? " · seated" : ""}
                </span>
              </li>
            ))}
          </ul>
          {/* Cancelling needs an UPDATE a guest does not have — reservations_read_own is
              a read policy. Saying who can is better than a button that fails. */}
          <p
            className="eyebrow"
            style={{ marginTop: "var(--space-2)", color: "var(--color-fg-subtle)" }}
          >
            Need to change or cancel one? Ask us and we&rsquo;ll sort it.
          </p>
        </section>
      )}

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 var(--space-5)" }}>
        <legend className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
          How many people
        </legend>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {PARTY_SIZES.map((n) => (
            <Choice key={n} on={party === n} onClick={() => setParty(n)}>
              {n}
            </Choice>
          ))}
        </div>
        <p
          className="eyebrow"
          style={{ marginTop: "var(--space-2)", color: "var(--color-fg-subtle)" }}
        >
          More than eight? Ask us — we&rsquo;ll join tables
        </p>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 var(--space-5)" }}>
        <legend className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
          Day
        </legend>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {days.map((d) => (
            <Choice
              key={d.key}
              on={dayKey === d.key}
              onClick={() => {
                setDayKey(d.key);
                setSlot(null);
              }}
            >
              {/* Weekday AND date. "Sat" alone does not say which Saturday, and past
                  the first one the guest is guessing. */}
              <span style={{ display: "grid", lineHeight: 1.15, textAlign: "center" }}>
                <span>{d.label}</span>
                <span className="mono" style={{ fontSize: "var(--text-step--1)", opacity: 0.75 }}>
                  {d.dateLabel}
                </span>
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 var(--space-5)" }}>
        <legend className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
          Time
        </legend>
        {!day || day.slots.length === 0 ? (
          <p style={{ color: "var(--color-fg-muted)" }}>
            {day?.closed
              ? "The kitchen is closed that day. Try another."
              : "No times left today — try tomorrow, or join the queue below."}
          </p>
        ) : (
          /*
           * Lunch and dinner, separately.
           *
           * These are two sittings with a closed kitchen between them, and flattening
           * them produced one undivided run of ~14 buttons from noon to eleven — which
           * reads as a restaurant that serves continuously all day. A guest scanning
           * for "somewhere around eight" had to work out where dinner began.
           *
           * A service with no slots left is omitted rather than shown empty.
           */
          SERVICES.filter((svc) => day.slots.some((s) => s.service === svc.key)).map((svc) => (
            <div key={svc.key} style={{ marginBottom: "var(--space-4)" }}>
              <p
                className="eyebrow"
                style={{ marginBottom: "var(--space-2)", color: "var(--color-fg-muted)" }}
              >
                {svc.label}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(5.5rem, 1fr))",
                  gap: "var(--space-2)",
                }}
              >
                {day.slots
                  .filter((s) => s.service === svc.key)
                  .map((s) => (
                    <Choice
                      key={s.iso}
                      on={slot === s.iso}
                      disabled={!s.available}
                      onClick={() => setSlot(s.iso)}
                    >
                      {s.label}
                    </Choice>
                  ))}
              </div>
            </div>
          ))
        )}
        <p
          className="eyebrow"
          style={{ marginTop: "var(--space-2)", color: "var(--color-fg-subtle)" }}
        >
          Greyed-out times are genuinely full — capacity is checked against the book
        </p>
      </fieldset>

      {!signedIn ? (
        <Link
          href={"/auth/sign-in?returnTo=/reserve" as never}
          role="button"
          style={{
            display: "flex",
            minHeight: "52px",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent)",
            color: "var(--color-accent-fg)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Sign in to book
        </Link>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <button
            type="button"
            onClick={() => void book()}
            disabled={busy || !slot}
            aria-busy={busy}
            style={{
              minHeight: "52px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: slot ? "var(--color-accent)" : "var(--color-bg-raised)",
              color: slot ? "var(--color-accent-fg)" : "var(--color-fg-subtle)",
              font: "inherit",
              fontWeight: 600,
              fontSize: "var(--text-step-0)",
              cursor: busy ? "progress" : slot ? "pointer" : "not-allowed",
            }}
          >
            {busy ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-2)",
                }}
              >
                <Spinner label="Booking your table" />
                Booking…
              </span>
            ) : slot ? (
              "Confirm booking"
            ) : (
              "Pick a time"
            )}
          </button>

          {!inQueue && (
            <button
              type="button"
              onClick={() => void joinQueue()}
              disabled={busy}
              style={{
                minHeight: "52px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border-strong)",
                background: "transparent",
                color: "var(--color-fg)",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              Or join the queue now
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Choice({
  children,
  on,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: "44px",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${
          on ? "var(--color-accent)" : disabled ? "var(--color-border)" : "var(--color-border-strong)"
        }`,
        background: on ? "var(--color-accent)" : "transparent",
        color: on
          ? "var(--color-accent-fg)"
          : disabled
            ? "var(--color-fg-subtle)"
            : "var(--color-fg)",
        font: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        textDecoration: disabled ? "line-through" : "none",
      }}
    >
      {children}
    </button>
  );
}
