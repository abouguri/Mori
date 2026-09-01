import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mori",
    short_name: "Mori",
    description: "Imports Anki .apkg decks and schedules them with FSRS.",
    start_url: "/decks",
    display: "standalone",
    background_color: "#F8FAF1",
    theme_color: "#003A0B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
