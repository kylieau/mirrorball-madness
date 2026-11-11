// Renders board.html and each phone to pngs/. Run from the project root:
//   node docs/design/curtain-call-finale-podium/screenshot.mjs
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.join(DIR, "pngs");
mkdirSync(PNG, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1780, height: 1100 }, deviceScaleFactor: 2 });
  await page.goto(`file://${path.join(DIR, "board.html")}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(PNG, "board.png"), fullPage: true });
  for (const id of ["1", "2", "3", "4"]) {
    await page.locator(`#shot-${id}`).screenshot({ path: path.join(PNG, `${id}.png`) });
  }
} finally {
  await browser.close();
}
console.log("done");
