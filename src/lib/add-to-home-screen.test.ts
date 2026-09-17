import { describe, expect, it } from "vitest";
import {
  detectInstallPlatform,
  detectInstallSurface,
  shouldShowInstallSteps,
} from "./add-to-home-screen";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const MAC_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("detectInstallPlatform", () => {
  it("treats iPhone Safari as iOS", () => {
    expect(detectInstallPlatform({ userAgent: IPHONE_SAFARI })).toBe("ios");
  });

  it("treats Android Chrome as Android", () => {
    expect(detectInstallPlatform({ userAgent: ANDROID_CHROME })).toBe("android");
  });

  it("treats iPad Safari as iOS", () => {
    expect(detectInstallPlatform({ userAgent: IPAD_SAFARI })).toBe("ios");
  });

  it("treats iPadOS-as-Macintosh (touch Mac) as iOS", () => {
    expect(detectInstallPlatform({ userAgent: MAC_DESKTOP, maxTouchPoints: 5 })).toBe("ios");
  });

  it("defaults a desktop Mac to the iPhone steps", () => {
    expect(detectInstallPlatform({ userAgent: MAC_DESKTOP, maxTouchPoints: 0 })).toBe("ios");
  });
});

describe("detectInstallSurface", () => {
  it("prefers the Capacitor wrapper over standalone display-mode", () => {
    expect(
      detectInstallSurface({ isNativePlatform: true, isStandaloneDisplay: true })
    ).toBe("native");
  });

  it("detects an installed Home Screen PWA", () => {
    expect(
      detectInstallSurface({ isNativePlatform: false, isStandaloneDisplay: true })
    ).toBe("standalone");
  });

  it("treats a regular browser tab as browser", () => {
    expect(
      detectInstallSurface({ isNativePlatform: false, isStandaloneDisplay: false })
    ).toBe("browser");
  });
});

describe("shouldShowInstallSteps", () => {
  it("shows iOS/Android steps only in a browser tab", () => {
    expect(shouldShowInstallSteps("browser")).toBe(true);
    expect(shouldShowInstallSteps("standalone")).toBe(false);
    expect(shouldShowInstallSteps("native")).toBe(false);
  });
});
