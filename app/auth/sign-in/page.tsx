"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthAlt,
  AuthLink,
  AuthFormSkeleton,
  AuthShell,
  ErrorNote,
  Field,
  GoogleButton,
  PasswordField,
  SubmitButton,
  looksLikeEmail,
} from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { homeFor } from "@/lib/auth/roles";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("returnTo");
  /*
   * /auth/callback redirects failures here with ?error=…, e.g. "That sign-in link didn't
   * work. It may have expired — try again." Nothing read it, so the message was thrown
   * away and the person was shown a blank form with no idea why they were back on it.
   * A magic link that silently fails is indistinguishable from one that was never sent.
   */
  const linkError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function signIn(e: React.FormEvent) {
    e.preventDefault();

    // Checked here because the form is noValidate, which switched the browser's own
    // checks off without replacing them. A missing @ used to make a round trip and come
    // back as "That email and password don't match an account" — which is not the
    // problem and does not tell you where to look.
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!looksLikeEmail(email)) next.email = "That doesn’t look like an email address.";
    if (!password) next.password = "Enter your password.";

    setFieldErrors(next);
    if (next.email || next.password) return;

    setBusy(true);
    setError(null);
    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setBusy(false);
      // Say what to do next, not merely that it failed.
      setError(
        signInError.message.toLowerCase().includes("not confirmed")
          ? "That address hasn't been verified yet — check your email for the code."
          : "That email and password don't match an account.",
      );
      return;
    }

    // Route by role: a chef wants their station, not a generic dashboard.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    router.replace((returnTo ?? homeFor(profile?.role)) as never);
    router.refresh();
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback${
          returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
        }`,
      },
    });
    if (oauthError) {
      setBusy(false);
      setError("Google sign-in isn't available right now. Use email and password.");
    }
  }

  return (
    <AuthShell
      title="Sign in"
      intro="You only need an account to order — the menu is open to everyone."
      footer={
        <>
          No account? <AuthLink href="/auth/sign-up">Create one</AuthLink>
        </>
      }
    >
      {/* A failed sign-in attempt takes precedence over a stale link error. */}
      {(error ?? linkError) && <ErrorNote>{error ?? linkError}</ErrorNote>}

      <form onSubmit={signIn} noValidate>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
          value={email}
          // The error clears as soon as you start fixing it. Leaving it up while
          // someone types the correction reads as the fix not working.
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((f) => ({ ...f, email: undefined }));
          }}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          error={fieldErrors.password}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((f) => ({ ...f, password: undefined }));
          }}
        />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>

      <AuthAlt>or</AuthAlt>
      <GoogleButton onClick={() => void withGoogle()} busy={busy} />
    </AuthShell>
  );
}

export default function SignInPage() {
  // useSearchParams needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense
      fallback={
        /*
         * The footer is repeated here on purpose.
         *
         * `useSearchParams` puts the whole form behind this boundary, so the PRERENDERED
         * html is the fallback — and the fallback had no footer. "Create one" is the only
         * link to /auth/sign-up in the entire app, so until JavaScript arrived there was
         * no way for a new person to reach the sign-up page at all. Caught by the
         * orphan-route check in verify:features, which greps rendered HTML rather than
         * trusting that a link exists somewhere in the source.
         */
        <AuthShell
          title="Sign in"
          footer={
            <>
              No account? <AuthLink href="/auth/sign-up">Create one</AuthLink>
            </>
          }
        >
          <AuthFormSkeleton fields={2} />
        </AuthShell>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
