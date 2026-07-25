import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth/roles";

/**
 * OAuth and email-link callback.
 *
 * Handles both arrivals:
 *   - Google OAuth returns `?code=` to exchange for a session
 *   - an email confirmation link returns `?token_hash=&type=`
 *
 * Then routes by role, so a chef lands on their station rather than a generic page.
 *
 * NOTE FOR DEPLOYMENT: the redirect URI registered in Google Cloud is Supabase's
 * own callback (`https://<ref>.supabase.co/auth/v1/callback`), not this route.
 * Supabase then forwards here. The production domain must also be listed in
 * Supabase → Authentication → URL Configuration, or this works locally and 400s in
 * production — which is the classic Sunday-night discovery. See docs/08-runbook.md.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const returnTo = url.searchParams.get("returnTo");

  const supabase = await createSupabaseServerClient();

  let failed: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) failed = error.message;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "signup" | "email" | "recovery" | "invite" | "email_change",
    });
    if (error) failed = error.message;
  } else {
    failed = "missing code";
  }

  if (failed) {
    // Land on sign-in with something actionable rather than a blank error page.
    const back = new URL("/auth/sign-in", url.origin);
    back.searchParams.set(
      "error",
      "That sign-in link didn't work. It may have expired — try again.",
    );
    return NextResponse.redirect(back);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? null;
  }

  return NextResponse.redirect(new URL(returnTo ?? homeFor(role), url.origin));
}
