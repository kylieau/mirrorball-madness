import type { MetadataRoute } from "next";
import { APP } from "@/config/app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP.name,
    short_name: APP.name,
    description: APP.tagline,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1e1420",
    theme_color: "#1e1420",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
