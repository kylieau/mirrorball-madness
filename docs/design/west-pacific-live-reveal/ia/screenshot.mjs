import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '/usr/local/lib/node_modules/playwright-core/index.js';
const { chromium } = pkg;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PNG_IA = path.join(DIR, 'pngs');
const PNG_ROOT = path.join(DIR, '..', 'pngs');

const shots = [
  { html: '00-system-map.html', out: '00-system-map.png' },
  { html: '00b-night-timeline.html', out: '00b-night-timeline.png' },
  { html: '00c-eng-gaps.html', out: '00c-eng-gaps.png' },
  { html: '01-plain-flow.html', out: '01-plain-flow.png' },
  { html: '02-sf-ooo.html', out: '02-sf-ooo.png' },
];

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const s of shots) {
  const page = await browser.newPage({
    viewport: { width: 1700, height: 1100 },
    deviceScaleFactor: 2,
  });
  const url = 'file://' + path.join(DIR, s.html);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const clip = await page.$eval('#shot', (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, r.x),
      y: Math.max(0, r.y),
      width: Math.ceil(r.width),
      height: Math.ceil(r.height),
    };
  });

  const needW = Math.ceil(clip.x + clip.width + 10);
  const needH = Math.ceil(clip.y + clip.height + 10);
  const vp = page.viewportSize();
  if (needW > vp.width || needH > vp.height) {
    await page.setViewportSize({
      width: Math.max(vp.width, needW),
      height: Math.max(vp.height, needH),
    });
  }

  const clip2 = await page.$eval('#shot', (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, r.x),
      y: Math.max(0, r.y),
      width: Math.ceil(r.width),
      height: Math.ceil(r.height),
    };
  });

  const outIa = path.join(PNG_IA, s.out);
  const outRoot = path.join(PNG_ROOT, s.out);
  await page.screenshot({ path: outIa, type: 'png', clip: clip2 });
  await page.screenshot({ path: outRoot, type: 'png', clip: clip2 });
  console.log(s.out, clip2.width + 'x' + clip2.height, '→', outIa);
  await page.close();
}

await browser.close();
console.log('done');
