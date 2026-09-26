import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import pkg from '/usr/local/lib/node_modules/playwright-core/index.js';
const { chromium } = pkg;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.join(DIR, 'pngs');
mkdirSync(PNG, { recursive: true });

const shots = [
  { html: 'board.html', out: '01-sf-styles-board.png', vp: { width: 1580, height: 1680 } },
  { html: '02-soft-inset.html', out: '02-soft-inset.png', vp: { width: 460, height: 1000 } },
  { html: '03-chip-row.html', out: '03-chip-row.png', vp: { width: 460, height: 1000 } },
  { html: '04-compact.html', out: '04-compact.png', vp: { width: 460, height: 1000 } },
  { html: '05-accent-rail.html', out: '05-accent-rail.png', vp: { width: 460, height: 1000 } },
  { html: '06-soft-scroll.html', out: '06-soft-scroll.png', vp: { width: 460, height: 1000 } },
  { html: '07-chip-scroll.html', out: '07-chip-scroll.png', vp: { width: 460, height: 1000 } },
];

async function shotEl(page, sel, outPath) {
  const box = await page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const pad = 4;
  let clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
  const vp = page.viewportSize();
  const needW = Math.ceil(clip.x + clip.width + 20);
  const needH = Math.ceil(clip.y + clip.height + 20);
  if (needW > vp.width || needH > vp.height) {
    await page.setViewportSize({
      width: Math.max(vp.width, needW),
      height: Math.max(vp.height, needH),
    });
    const box2 = await page.$eval(sel, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    clip = {
      x: Math.max(0, box2.x - pad),
      y: Math.max(0, box2.y - pad),
      width: box2.width + pad * 2,
      height: box2.height + pad * 2,
    };
  }
  await page.screenshot({ path: outPath, type: 'png', clip, omitBackground: false });
  return clip;
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const s of shots) {
  const page = await browser.newPage({
    viewport: s.vp,
    deviceScaleFactor: 2,
  });
  const url = 'file://' + path.join(DIR, s.html);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const out = path.join(PNG, s.out);
  const clip = await shotEl(page, '#shot', out);
  const dims = await page.$eval('#shot', (el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log(s.out, 'css', dims, 'clip', Math.round(clip.width), Math.round(clip.height));
  await page.close();
}

await browser.close();
console.log('done');
