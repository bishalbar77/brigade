import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brigade — the menu as a live function of the pantry",
  description:
    "Restaurant operations platform. Computes how long until each dish runs out, warns the kitchen before it does, and shows guests what's actually available.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* density is switched per route group: guest (default) vs ops */}
      <body data-density="guest">{children}</body>
    </html>
  );
}
