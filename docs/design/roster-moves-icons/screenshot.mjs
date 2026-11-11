// Renders board.html to pngs/board.png. Run from the project root:
//   node docs/design/roster-moves-icons/screenshot.mjs
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.join(DIR, "pngs");
mkdirSync(PNG, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1250, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`file://${path.join(DIR, "board.html")}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(PNG, "board.png"), fullPage: true });
} finally {
  await browser.close();
}
console.log("done");
