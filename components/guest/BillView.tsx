"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCents, tipFromPercent } from "@/lib/money";
import type { ItemStatus } from "@/lib/ops/tickets";

/*
 * The bill.
 *
 * Priced from what was actually SERVED, at the price captured on each line — never
 * re-joined to the current dish price, or editing a price would silently rewrite an
 * open bill. Voided items are shown as cancelled rather than removed: something
 * disappearing without explanation is worse than bad news.
 *
 * The totals here are for READING. The server recomputes them in pay_order(); a
 * client-submitted total is a client-controlled price.
 */

export interface BillLine {
  id: string;
  dishName: string;
  qty: number;
  unitPriceCents: number;
  status: ItemStatus;
}

const TIPS = [0, 10, 12.5, 15] as const;

export function BillView({
  orderId,
  tableLabel,
  lines,
  taxRate,
  alreadyPaid,
  paidTotalCents,
}: {
  orderId: string;
  tableLabel: string | null;
  lines: BillLine[];
  taxRate: number;
  alreadyPaid: boolean;
  paidTotalCents: number;
}) {
  const router = useRouter();
  const [tipPct, setTipPct] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(alreadyPaid);

  const served = lines.filter((l) => l.status === "served");
  const voided = lines.filter((l) => l.status === "voided");
  const pending = lines.filter((l) => l.status !== "served" && l.status !== "voided");

  const subtotal = served.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
  const tax = Math.round(subtotal * taxRate);
  const tip = tipFromPercent(subtotal, tipPct);
  const total = subtotal + tax + tip;

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orders/${orderId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "card", tipCents: tip }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "That payment didn't go through.");
      return;
    }
    setPaid(true);
    router.refresh();
  }

  if (paid) {
    return (
      <section style={{ padding: "var(--space-6) var(--space-4)" }}>
        <h1 style={{ fontSize: "var(--text-step-2)" }}>Paid</h1>
        <p style={{ color: "var(--color-fg-muted)", margin: "var(--space-4) 0" }}>
          {formatCents(paidTotalCents || total)} settled
          {tableLabel ? ` for table ${tableLabel}` : ""}. Thanks for coming in.
        </p>
        <Link href="/menu" style={{ color: "var(--color-accent)" }}>
          Back to the menu →
        </Link>
      </section>
    );
  }

  return (
    <section style={{ padding: "var(--space-5) var(--space-4) var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-step-2)", marginBottom: "var(--space-2)" }}>Your bill</h1>
      <p className="eyebrow" style={{ marginBottom: "var(--space-5)" }}>
        {tableLabel ? `Table ${tableLabel}` : "Takeaway"}
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

      {/* Charging for food that never arrived is the worst bug this screen could have,
          so the state is shown plainly and payment is withheld rather than estimated. */}
      {pending.length > 0 && (
        <p
          style={{
            border: "1px solid var(--color-runway-low)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            marginBottom: "var(--space-5)",
          }}
        >
          <strong>Still with the kitchen.</strong>{" "}
          {pending.length} item{pending.length === 1 ? "" : "s"} haven&rsquo;t been served yet, so
          they&rsquo;re not on this bill. You can settle up once everything has arrived.
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {served.map((l) => (
          <li
            key={l.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-4)",
              padding: "var(--space-3) 0",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <span>
              {l.qty > 1 && <span className="mono">{l.qty}× </span>}
              {l.dishName}
              <span className="eyebrow" style={{ marginLeft: "var(--space-2)" }}>
                {formatCents(l.unitPriceCents)} each
              </span>
            </span>
            <span className="mono">{formatCents(l.unitPriceCents * l.qty)}</span>
          </li>
        ))}

        {voided.map((l) => (
          <li
            key={l.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-4)",
              padding: "var(--space-3) 0",
              borderBottom: "1px solid var(--color-border)",
              opacity: 0.7,
            }}
          >
            <span>
              <span style={{ textDecoration: "line-through" }}>{l.dishName}</span>
              <span className="eyebrow" style={{ marginLeft: "var(--space-2)" }}>
                cancelled — not charged
              </span>
            </span>
            <span className="mono" style={{ textDecoration: "line-through" }}>
              {formatCents(l.unitPriceCents * l.qty)}
            </span>
          </li>
        ))}
      </ul>

      <fieldset style={{ border: "none", padding: 0, margin: "var(--space-5) 0 0" }}>
        <legend className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
          Add a tip
        </legend>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {TIPS.map((pct) => {
            const on = tipPct === pct;
            return (
              <button
                key={pct}
                type="button"
                aria-pressed={on}
                onClick={() => setTipPct(pct)}
                style={{
                  minHeight: "44px",
                  padding: "0 var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border-strong)"}`,
                  background: on ? "var(--color-accent)" : "transparent",
                  color: on ? "var(--color-accent-fg)" : "var(--color-fg)",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                {pct === 0 ? "None" : `${pct}%`}
              </button>
            );
          })}
        </div>
      </fieldset>

      <dl style={{ margin: "var(--space-5) 0", display: "grid", gap: "var(--space-2)" }}>
        <Row label="Subtotal" value={formatCents(subtotal)} />
        <Row label={`Tax (${(taxRate * 100).toFixed(0)}%)`} value={formatCents(tax)} />
        {tip > 0 && <Row label={`Tip (${tipPct}%)`} value={formatCents(tip)} />}
        <Row label="Total" value={formatCents(total)} strong />
      </dl>

      <button
        type="button"
        onClick={() => void pay()}
        disabled={busy || pending.length > 0 || served.length === 0}
        style={{
          width: "100%",
          minHeight: "52px",
          borderRadius: "var(--radius-md)",
          border: "none",
          background:
            pending.length > 0 || served.length === 0
              ? "var(--color-bg-raised)"
              : "var(--color-accent)",
          color:
            pending.length > 0 || served.length === 0
              ? "var(--color-fg-subtle)"
              : "var(--color-accent-fg)",
          font: "inherit",
          fontWeight: 600,
          fontSize: "var(--text-step-0)",
          cursor: busy ? "progress" : "pointer",
        }}
      >
        {busy
          ? "Paying…"
          : served.length === 0
            ? "Nothing served yet"
            : pending.length > 0
              ? "Waiting on the kitchen"
              : `Pay ${formatCents(total)}`}
      </button>

      <p
        className="eyebrow"
        style={{ marginTop: "var(--space-3)", color: "var(--color-fg-subtle)" }}
      >
        Payment is simulated for this demo — no card is charged
      </p>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <dt style={{ color: strong ? "var(--color-fg)" : "var(--color-fg-muted)" }}>{label}</dt>
      <dd
        className="mono"
        style={{
          margin: 0,
          fontWeight: strong ? 600 : 400,
          fontSize: strong ? "var(--text-step-1)" : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
