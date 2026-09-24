import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Libre_Caslon_Text } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { NativeAuthListener } from "@/components/native-auth-listener";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const caslon = Libre_Caslon_Text({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-rank" });

export const metadata: Metadata = {
  title: "Mirrorball Madness",
  description: "Fantasy sports for Dancing with the Stars.",
  // Makes iOS "Add to Home Screen" open as a standalone web app (no Safari
  // chrome) — required later for web push, and what the install notice asks
  // people to do. Not a service worker / FCM setup.
  appleWebApp: {
    capable: true,
    title: "Mirrorball Madness",
    statusBarStyle: "black-translucent",
  },
};

// viewportFit: "cover" lets the app draw under the iPhone notch/status bar
// inside Capacitor's WKWebView (which renders edge-to-edge by default),
// which is what makes the env(safe-area-inset-*) values below non-zero.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e1420",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(fraunces.variable, inter.variable, caslon.variable)}>
      <body className="font-sans antialiased">
        <NativeAuthListener />
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
