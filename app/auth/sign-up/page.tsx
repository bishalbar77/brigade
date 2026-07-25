"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

/*
 * Guest sign-up. Staff are never created here.
 *
 * Role is NEVER accepted from this form. Everyone who signs up is a guest; staff
 * roles come only from an owner's invite. A signup that could choose its own role
 * is a privilege-escalation hole, and the default lives in the `handle_new_user`
 * trigger rather than in this component.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setBusy(false);

    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes("already registered")
          ? "There's already an account with that address. Sign in instead."
          : signUpError.message,
      );
      return;
    }

    // A confirmed session straight away means email confirmation is switched off
    // in the project. Don't send them to a verify screen with nothing to verify.
    if (data.session) {
      router.replace("/menu");
      router.refresh();
      return;
    }

    router.replace(`/auth/verify?email=${encodeURIComponent(email)}` as never);
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setBusy(false);
      setError("Google sign-in isn't available right now. Use email and password.");
    }
  }

  return (
    <AuthShell
      title="Create an account"
      intro="So we can show you your order as the kitchen cooks it, and keep your bill."
      footer={
        <>
          Already have one? <AuthLink href="/auth/sign-in">Sign in</AuthLink>
        </>
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}

      <form onSubmit={signUp} noValidate>
        <Field
          label="Name"
          name="full_name"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>

      <AuthAlt>or</AuthAlt>
      <GoogleButton onClick={() => void withGoogle()} busy={busy} />
    </AuthShell>
  );
}
