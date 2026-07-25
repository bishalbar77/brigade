/**
 * Where each role lands after signing in.
 *
 * The brigade hierarchy IS the permission model, so routing follows the job rather
 * than a generic dashboard: a chef de partie wants their station's tickets, a
 * maître d' wants the book, an owner wants the numbers. Dropping everyone on one
 * home page and making them navigate is a tax paid once per shift, per person.
 *
 * This is presentation. RLS is what actually withholds the data — see ADR-3.
 */

export type AppRole = "owner" | "manager" | "chef" | "expo" | "server" | "host" | "guest";

export const ROLE_HOME: Record<AppRole, string> = {
  owner: "/ops/analytics",
  manager: "/ops/inventory",
  chef: "/ops/kds",
  expo: "/ops/kds",
  server: "/ops/floor",
  host: "/ops/reservations",
  guest: "/menu",
};

/** The brigade term for a role, for ops surfaces. Guests never see these. */
export const ROLE_TITLE: Record<AppRole, string> = {
  owner: "Chef de cuisine",
  manager: "Sous chef",
  chef: "Chef de partie",
  expo: "Expo",
  server: "Chef de rang",
  host: "Maître d'",
  guest: "Guest",
};

export function homeFor(role: string | null | undefined): string {
  return ROLE_HOME[(role ?? "guest") as AppRole] ?? "/menu";
}

export function isStaff(role: string | null | undefined): boolean {
  return Boolean(role) && role !== "guest";
}
