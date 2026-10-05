// Screenshots the four fan tabs (plus Manage Leagues) at phone widths as the
// scratch viewer from seed.mjs, against a running dev server. Run from the
// project root after `seed.mjs up`:
//
//   node --env-file=.env.local scripts/qa-screenshots/shoot.mjs <out-dir> [--at 2026-10-07T00:30:00Z]
//
// `--at` pins the browser clock (Date only, timers keep running) so the Home
// curtain and live-air chrome can be captured in a state the real clock
// isn't in. Needs a Chromium binary: CHROMIUM_PATH or /usr/bin/chromium.
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const VIEWPORTS = [
  { label: "360", width: 360, height: 780 },
  { label: "390", width: 390, height: 844 },
];

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith("--"));
if (!outDir) throw new Error("Usage: shoot.mjs <out-dir> [--at <iso>]");
const atIndex = args.indexOf("--at");
const fixedTime = atIndex >= 0 ? new Date(args[atIndex + 1]) : null;

const state = JSON.parse(await readFile(new URL("./.qa-state.json", import.meta.url), "utf8"));
const { email } = state.users.viewer;
const leagueId = state.leagueId;

const PAGES = [
  { name: "home", path: "/" },
  { name: "results", path: "/this-week" },
  { name: "picks", path: `/leagues/${leagueId}/picks` },
  { name: "standings", path: `/leagues/${leagueId}/standings`, expand: true },
  { name: "manage-leagues", path: "/leagues" },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    if (fixedTime) await page.clock.setFixedTime(fixedTime);

    await page.goto(`${BASE_URL}/login`);
    await page.fill("#email", email);
    await page.fill("#password", state.password);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);

    const dir = path.join(outDir, viewport.label);
    await mkdir(dir, { recursive: true });
    for (const target of PAGES) {
      await page.goto(`${BASE_URL}${target.path}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: path.join(dir, `${target.name}-top.png`) });
      if (target.expand) {
        // Open the viewer's own Score History row and the League at a Glance
        // hops so the expanded states are in the full-page shot.
        for (const button of await page.getByRole("button", { name: /League at a Glance/i }).all()) {
          await button.click().catch(() => {});
        }
        await page.getByText("You", { exact: true }).first().click().catch(() => {});
        await page.waitForTimeout(600);
      }
      await page.screenshot({ path: path.join(dir, `${target.name}-full.png`), fullPage: true });
    }
    if (consoleErrors.length) {
      console.log(`[${viewport.label}] console errors:\n  ${consoleErrors.join("\n  ")}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Screenshots written to ${outDir}`);
