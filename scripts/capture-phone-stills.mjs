import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.STILL_BASE ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts/phone-still-pack";
const MIRROR = path.resolve("artifacts/phone-still-pack");

const SCENES = [
  {
    id: "curtain-picks-open",
    file: "curtain-picks-open.png",
    see: ["Picks Open", "Curtain Up Soon", "Live On Air", "Today", "Next"],
  },
  {
    id: "curtain-picks-locked",
    file: "curtain-picks-locked.png",
    see: ["Picks Locked", "Curtain Up Soon", "Live On Air", "Today", "Next"],
  },
  {
    id: "curtain-on-air-now",
    file: "curtain-on-air-now.png",
    see: ["Let's Dance", "On Air Live ET", "Picks Locked · Time to Vote", "Now"],
  },
  {
    id: "curtain-hold-the-curtain",
    file: "curtain-hold-the-curtain.png",
    see: ["Hold the Curtain", "Spoiler Lockdown", "West Coast Showtime", "Today", "Next"],
  },
  {
    id: "curtain-west-lets-dance",
    file: "curtain-west-lets-dance.png",
    see: ["Let's Dance", "On Air · Live PT", "No spoilers, darling", "Now"],
  },
  {
    id: "curtain-results-soon",
    file: "curtain-results-soon.png",
    see: ["Results Soon", "Curtain Closed", "Tallying the scores", "Now"],
  },
  {
    id: "curtain-scores-are-in",
    file: "curtain-scores-are-in.png",
    see: ["Scores Are In", "That's a Wrap", "See where you landed", "Next"],
  },
  {
    id: "curtain-cc-off-curtain-up-soon",
    file: "curtain-cc-off-curtain-up-soon.png",
    see: ["Curtain Up Soon", "Live On Air", "Today", "Next"],
    absent: ["Picks Open", "Picks Locked"],
  },
  {
    id: "curtain-cc-off-time-to-vote",
    file: "curtain-cc-off-time-to-vote.png",
    see: ["Let's Dance", "On Air Live ET", "Time to Vote", "Now"],
    absent: ["Picks Locked"],
  },
  {
    id: "strip-ready",
    file: "strip-ready.png",
    see: ["Spoiler-Free", "Week 4 results are in", "Mark Watched"],
  },
  {
    id: "strip-posting",
    file: "strip-posting.png",
    see: ["Spoiler-Free", "Week 4 scores posting now", "Mark Watched"],
  },
  {
    id: "strip-watching",
    file: "strip-watching.png",
    see: ["Watching live", "Week 4"],
    absent: ["Mark Watched"],
  },
  {
    id: "mark-watched-single",
    file: "mark-watched-single.png",
    click: "single",
    see: ["Mark Week 4 Watched?", "Scores, dances, and eliminations will show through this week."],
    absent: ["Choose an Earlier Week"],
  },
  {
    id: "mark-watched-choose-earlier",
    file: "mark-watched-choose-earlier.png",
    click: "choose",
    see: ["Mark Week 4 Watched?", "Choose an Earlier Week"],
  },
  {
    id: "mark-watched-list",
    file: "mark-watched-list.png",
    click: "list",
    see: ["I've Watched Through", "Week 2", "Week 3", "Week 4", "Latest", "Mark Through Week 4"],
  },
  {
    id: "live-scores-prompt",
    file: "live-scores-prompt.png",
    see: [
      "Scores Have Started Posting",
      "Stay Updated — I'm Watching Live",
      "Mark Week 4 Watched",
      "Dismiss",
      "Weeks 2 and 3",
    ],
  },
  {
    id: "home-create-join",
    file: "home-create-join.png",
    see: ["+ Create a League", "Join with Code"],
  },
  {
    id: "settings-last-watched",
    file: "settings-last-watched.png",
    see: ["I last watched", "Week 3", "Spoiler-Free Mode", "Choose the last week you've watched"],
  },
  {
    id: "settings-last-watched-open",
    file: "settings-last-watched-open.png",
    click: "select",
    see: ["I last watched", "None", "Week 5", "Week 1"],
  },
];

function exact(text) {
  return text === "Now" || text === "Next" || text === "Time to Vote";
}

async function prepare(page, scene) {
  // Clicks before hydration land on the server HTML and are dropped.
  await page.waitForFunction(() => {
    const el = document.querySelector("button");
    return !!el && Object.keys(el).some((key) => key.startsWith("__reactProps"));
  });
  if (scene.click === "single" || scene.click === "choose" || scene.click === "list") {
    await page.getByRole("button", { name: "Mark Watched" }).click();
    await page.getByRole("heading", { name: "Mark Week 4 Watched?" }).waitFor();
  }
  if (scene.click === "list") {
    await page.getByRole("button", { name: "Choose an Earlier Week ›" }).click();
    await page.getByText("I've Watched Through").waitFor();
  }
  if (scene.click === "select") {
    await page.locator("[data-slot=select-trigger]").click();
    await page.getByRole("option", { name: "None" }).waitFor();
  }
  for (const text of scene.see) {
    await page.getByText(text, { exact: exact(text) }).first().waitFor({ timeout: 20000 });
  }
  for (const text of scene.absent ?? []) {
    const count = await page.getByText(text, { exact: true }).count();
    if (count > 0) throw new Error(`${scene.id} unexpectedly shows "${text}"`);
  }
}

async function measure(page) {
  const viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const banner = page.locator(".h-48");
  let curtain = null;
  if ((await banner.count()) > 0) {
    curtain = await banner.first().evaluate((el) => {
      const title = el.querySelector(".font-heading.font-black");
      const chip = el.querySelector("p");
      const rail = [...el.querySelectorAll("span")].find((node) => node.className.includes("uppercase"));
      const parent = el.getBoundingClientRect();
      const rect = (node) => (node ? node.getBoundingClientRect() : null);
      const titleBox = rect(title);
      const chipBox = rect(chip);
      const railBox = rect(rail);
      return {
        bannerH: Math.round(parent.height),
        title: title?.textContent ?? "",
        titleLines: title ? title.getClientRects().length : 0,
        titlePx: title ? getComputedStyle(title).fontSize : "",
        titleClipped: titleBox ? titleBox.bottom > parent.bottom + 1 || titleBox.top < parent.top - 1 : null,
        chip: (chip?.textContent ?? "").replace(/\s+/g, " ").trim(),
        chipH: chipBox ? Math.round(chipBox.height) : 0,
        chipOverflow: chip ? chip.scrollWidth > chip.clientWidth + 1 : null,
        rail: rail?.textContent ?? "",
        railClipped: railBox ? railBox.bottom > parent.bottom + 1 || railBox.top < parent.top - 1 : null,
      };
    });
  }
  const line = page.locator("p.truncate");
  let strip = null;
  if ((await line.count()) > 0) {
    strip = await line.first().evaluate((el) => ({
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflow: el.scrollWidth > el.clientWidth + 1,
      height: Math.round(el.getBoundingClientRect().height),
    }));
  }
  const railMeta = page.locator("[data-rail-marker]");
  let rail = null;
  if ((await railMeta.count()) > 0) {
    rail = {
      marker: await railMeta.getAttribute("data-rail-marker"),
      week: await railMeta.getAttribute("data-rail-week"),
      kind: await railMeta.getAttribute("data-banner-kind"),
    };
  }
  return { viewport, curtain, strip, rail };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  timezoneId: "America/Los_Angeles",
  colorScheme: "dark",
});

await mkdir(OUT, { recursive: true });
await mkdir(MIRROR, { recursive: true });

const report = [];
for (const scene of SCENES) {
  const page = await context.newPage();
  const url = `${BASE}/dev/phone-still-pack?scene=${scene.id}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await prepare(page, scene);
  await page.waitForTimeout(300);
  const measured = await measure(page);
  if (measured.viewport.w !== 390) {
    throw new Error(`${scene.id}: viewport width ${measured.viewport.w}, expected 390`);
  }
  const dest = path.join(OUT, scene.file);
  await page.screenshot({ path: dest, animations: "disabled", fullPage: false });
  await copyFile(dest, path.join(MIRROR, scene.file));
  report.push({ file: scene.file, ...measured });
  console.log(scene.file, JSON.stringify(measured));
  await page.close();
}

await browser.close();
console.log("CAPTURED", report.length);
