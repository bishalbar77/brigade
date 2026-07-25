import { NextResponse } from "next/server";

/**
 * QR entry point. A code on table 7 points at /t/T7.
 *
 * Stores the table in a cookie and redirects to the menu, so `?table=` doesn't have
 * to be threaded through every subsequent URL — and so a guest who navigates away
 * and back is still at their table.
 *
 * Not validated against the tables list here: an unknown label simply means the cart
 * finds no matching table and treats the order as having none, which is the same
 * handling as a guest who never scanned anything. Doing a lookup on every scan would
 * add a query to the hottest path in the product for no behavioural gain.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ label: string }> },
) {
  const { label } = await params;
  const response = NextResponse.redirect(new URL("/menu", new URL(request.url).origin));

  response.cookies.set("brigade_table", decodeURIComponent(label), {
    httpOnly: false, // the cart screen reads it for display
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 6, // one long service; a table shouldn't stick for days
  });

  return response;
}
