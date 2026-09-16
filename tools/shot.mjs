/**
 * Screenshot tool. Serves dist/ and captures the game at given positions:
 *   node tools/shot.mjs homestead:800:700 whisperingWoods:400:900
 * Add --zoom=2 to frame a character closely for art review.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist', import.meta.url).pathname;
const OUT = new URL('../.verify', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function chromeBinary() {
  const direct = '/opt/pw-browsers/chromium/chrome-linux/chrome';
  if (existsSync(direct)) return direct;
  for (const dir of readdirSync('/opt/pw-browsers')) {
    const p = `/opt/pw-browsers/${dir}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  return undefined;
}

const args = process.argv.slice(2);
const zoomArg = args.find((a) => a.startsWith('--zoom='));
const zoom = zoomArg ? Number(zoomArg.split('=')[1]) : null;
const specs = args.filter((a) => !a.startsWith('--'));

mkdirSync(OUT, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const u = (req.url ?? '/').split('?')[0];
    const f = join(DIST, u === '/' ? 'index.html' : u);
    const b = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(4599, r));

const browser = await chromium.launch({
  executablePath: chromeBinary(),
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const page = await (await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
})).newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto('http://127.0.0.1:4599/index.html', { waitUntil: 'load' });
await page.waitForFunction(
  () => window.fantastania?.game?.scenes?.active && window.fantastania.game.scenes.fade < 0.05,
  null, { timeout: 20000 },
);

for (const spec of specs) {
  const [id, x, y] = spec.split(':');
  await page.evaluate(async ([id, x, y, zoom]) => {
    const s = window.fantastania.game.scenes.active;
    if (s.enterArea) await s.enterArea(id, 'default', false);
    if (x) { s.player.x = +x; s.player.y = +y; }
    if (zoom) window.fantastania.game.camera.zoom = zoom;
    window.fantastania.game.camera.snapTo(s.player.x, s.player.y);
  }, [id, x, y, zoom]);
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 900));
  await page.screenshot({ path: join(OUT, `area-${id}.png`) });
  console.log('shot', id);
}

await browser.close();
server.close();
