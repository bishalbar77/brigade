"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthAlt,
  AuthLink,
  AuthShell,
  ErrorNote,
  Field,
  GoogleButton,
  SubmitButton,
} from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { homeFor } from "@/lib/auth/roles";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
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
      {error && <ErrorNote>{error}</ErrorNote>}

      <form onSubmit={signIn} noValidate>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
    <Suspense fallback={<AuthShell title="Sign in">{null}</AuthShell>}>
      <SignInForm />
    </Suspense>
  );
}
