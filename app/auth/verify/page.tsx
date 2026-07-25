"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthFormSkeleton,
  AuthShell,
  ErrorNote,
  Field,
  SubmitButton,
} from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { homeFor } from "@/lib/auth/roles";

/*
 * Email verification.
 *
 * Supports BOTH paths, because which one a project uses depends on its email
 * template:
 *   - a 6-digit code entered here, when the template includes {{ .Token }}
 *   - a link in the email, handled by /auth/callback, which is the default
 *
 * The code path is the better demo (no inbox on screen), so it's the primary
 * affordance — but the link is explained rather than left as a dead end if the
 * template hasn't been changed. See docs/08-runbook.md.
 *
 * Known operational risk: Supabase's built-in SMTP is rate-capped and will simply
 * stop sending, which looks like broken auth. Resend is always available here.
 */
function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "signup",
    });

    setBusy(false);

    if (verifyError) {
      const msg = verifyError.message.toLowerCase();
      setError(
        msg.includes("expired")
          ? "That code has expired. Send a new one."
          : "That code isn't right. Check it and try again.",
      );
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user!.id)
      .single();

    router.replace(homeFor(profile?.role) as never);
    router.refresh();
  }

  async function resend() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    setBusy(false);
    if (resendError) {
      // The cap is the likeliest cause, and it is worth naming so it doesn't look
      // like the address is wrong.
      setError("We couldn't send another code just now. Wait a minute and try again.");
      return;
    }
    setResent(true);
  }

  return (
    <AuthShell
      title="Verify your email"
      intro={
        email
          ? `We sent a code to ${email}. Enter it below.`
          : "Enter the code from the email we sent you."
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {resent && (
        <p style={{ marginBottom: "var(--space-4)", color: "var(--color-ok)" }}>
          Sent. It can take a moment to arrive.
        </p>
      )}

      <form onSubmit={verify} noValidate>
        <Field
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          hint="Six digits."
        />
        <SubmitButton busy={busy}>Verify</SubmitButton>
      </form>

      <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-4)" }}>
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy || !email}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-accent)",
            font: "inherit",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Send a new code
        </button>
      </div>

      <p
        style={{
          marginTop: "var(--space-5)",
          color: "var(--color-fg-subtle)",
          fontSize: "var(--text-step--1)",
        }}
      >
        Your email may contain a link instead of a code — opening it verifies you the
        same way.
      </p>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Verify your email">
          <AuthFormSkeleton fields={1} />
        </AuthShell>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
