import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "../styles/tokens.css";

// Previously referenced by name in tokens.css (var(--font-display) etc.)
// without ever being loaded anywhere — browsers were silently falling back
// to system-ui/Georgia the whole time. Loading them for real now, via
// next/font/google (self-hosted at build time, no runtime request).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mori",
  description: "Imports Anki .apkg decks and schedules them with FSRS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
