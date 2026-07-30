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
  PasswordField,
  SubmitButton,
  looksLikeEmail,
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
  const [fieldErrors, setFieldErrors] = useState<{
    full_name?: string;
    email?: string;
    password?: string;
  }>({});

  async function signUp(e: React.FormEvent) {
    e.preventDefault();

    // Per FIELD, not one banner at the top. "Use at least 8 characters" above three
    // inputs does not say which one it means, and it replaced whatever else was wrong.
    const next: { full_name?: string; email?: string; password?: string } = {};
    if (!fullName.trim()) next.full_name = "What should we call you?";
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!looksLikeEmail(email)) next.email = "That doesn’t look like an email address.";
    if (!password) next.password = "Choose a password.";
    else if (password.length < 8) next.password = "Use at least 8 characters.";

    setFieldErrors(next);
    if (next.full_name || next.email || next.password) return;

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

    /*
     * A session straight away is the EXPECTED path now.
     *
     * Patch 008 removed the email-confirmation requirement from place_order(), and the
     * matching project setting is Authentication -> Providers -> Email -> "Confirm email"
     * OFF. With it off, signUp() returns a session and the account works immediately.
     *
     * The verify branch is kept as a fallback rather than deleted: if that setting is ever
     * switched back on, signUp() returns a user with NO session, and silently landing them
     * on /menu would leave them unable to order with no explanation. So the code still
     * handles it — it is just no longer the normal route.
     */
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
          error={fieldErrors.full_name}
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            setFieldErrors((f) => ({ ...f, full_name: undefined }));
          }}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((f) => ({ ...f, email: undefined }));
          }}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          error={fieldErrors.password}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((f) => ({ ...f, password: undefined }));
          }}
        />
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>

      <AuthAlt>or</AuthAlt>
      <GoogleButton onClick={() => void withGoogle()} busy={busy} />
    </AuthShell>
  );
}
