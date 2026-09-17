export type InstallPlatform = "ios" | "android";
export type InstallSurface = "browser" | "standalone" | "native";

export function detectInstallPlatform(input: {
  userAgent: string;
  maxTouchPoints?: number;
}): InstallPlatform {
  if (/android/i.test(input.userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(input.userAgent)) return "ios";
  // iPadOS 13+ reports as Macintosh but still uses Safari's Share sheet.
  if (/Macintosh/i.test(input.userAgent) && (input.maxTouchPoints ?? 0) > 1) {
    return "ios";
  }
  // Desktop / unknown: default to the iPhone path — that's the one people
  // get stuck on, and Android users can flip the toggle.
  return "ios";
}

export function detectInstallSurface(input: {
  isNativePlatform: boolean;
  isStandaloneDisplay: boolean;
}): InstallSurface {
  if (input.isNativePlatform) return "native";
  if (input.isStandaloneDisplay) return "standalone";
  return "browser";
}

// Install steps only apply in a browser tab. Capacitor and an already-
// installed PWA already *are* the Home Screen app — Settings still shows
// a short note, not Safari/Chrome steps.
export function shouldShowInstallSteps(surface: InstallSurface): boolean {
  return surface === "browser";
}

export const INSTALL_STEPS = {
  ios: {
    label: "iPhone / iPad",
    steps: [
      "In Safari, tap Share (the square with an upward arrow).",
      "Scroll and tap Add to Home Screen, then Add.",
      "Open Mirrorball from the new icon — not the Safari tab.",
    ],
    footnote:
      "Safari only on iPhone. iOS 16.4+ is what later lets a Home Screen app ask for notifications.",
  },
  android: {
    label: "Android",
    steps: [
      "In Chrome, tap the three-dot menu (top right).",
      "Tap Add to Home screen or Install app.",
      "Tap Install, then open Mirrorball from the new icon.",
    ],
    footnote: "Same path works in Firefox, Edge, and Samsung Internet.",
  },
} as const;

export const ADD_TO_HOME_SCREEN_COPY = {
  title: "Add to Home Screen",
  detail: "Open from your Home Screen instead of a browser tab",
  accordionTitle: "How to add it",
  intro:
    "Push alerts aren't sending yet. Save the site now so it's one tap away — and so iPhone can ask for notifications later from the Home Screen app, not a Safari tab.",
};
