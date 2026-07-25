import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

/*
 * Three roles, three families, high contrast between them.
 *
 * Display — irregular, industrial-editorial. Deliberately NOT Space Grotesk,
 * which is the over-converged default for this register. Used with restraint:
 * titles and runway numerals only.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  weight: ["400", "600", "800"],
  display: "swap",
});

/* Body — real menus are set in serif. Signals restaurant, not dashboard, and
   it is the appetite lever on the guest side. Newsreader is screen-designed. */
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

/* Data — load-bearing, not decorative. Tabular figures stop a countdown's
   digits from jittering as they change, and dockets are a tabular read. */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brigade — the menu as a live function of the pantry",
  description:
    "Restaurant operations platform. Computes how long until each dish runs out, warns the kitchen before it does, and shows guests what's actually available.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e1815",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      {/* Density is set by each route group's layout, not here. */}
      <body>{children}</body>
    </html>
  );
}
