/**
 * Headless verification harness.
 *
 * Builds the game, serves `dist/`, drives it in a real Chromium at a phone-sized
 * landscape viewport and again at a desktop viewport, and fails on any console
 * error or unhandled rejection. Scenario steps are declared per phase so this
 * grows with the game instead of being rewritten each time.
 *
 *   node tools/verify.mjs               # run every scenario
 *   node tools/verify.mjs --shot        # also write screenshots to .verify/
 *   node tools/verify.mjs movement      # run one scenario by name
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const SHOT_DIR = join(ROOT, '.verify');
const wantShots = process.argv.includes('--shot');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serve(port) {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const rel = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
      const file = join(DIST, rel);
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** Viewports the game must work at. */
const VIEWPORTS = {
  phone: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  tablet: { width: 1180, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 860, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};

const scenarios = [];
function scenario(name, viewport, fn) {
  scenarios.push({ name, viewport, fn });
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

scenario('boot-desktop', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const ok = await page.evaluate(() => !!window.fantastania?.game);
  t.assert(ok, 'game instance is exposed after boot');
  const fps = await t.settleAndReadFps(page);
  t.assert(fps > 20, `frame rate is healthy (got ${fps})`);
});

scenario('boot-phone', 'phone', async (page, t) => {
  await t.waitForBoot(page);
  const view = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    return { w: r.viewWidth, h: r.viewHeight, scale: r.scale, dpr: r.dpr };
  });
  t.assert(view.h === 540, `logical height is fixed at 540 (got ${view.h})`);
  t.assert(view.w >= 780 && view.w <= 1280, `logical width in range (got ${view.w})`);
  t.assert(view.dpr <= 2, `device pixel ratio capped (got ${view.dpr})`);
});

scenario('movement', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const before = await t.playerPos(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyD');
  const after = await t.playerPos(page);
  t.assert(after.x - before.x > 30, `player moved right (${(after.x - before.x).toFixed(1)}u)`);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  const up = await t.playerPos(page);
  t.assert(up.y < after.y - 20, `player moved up (${(up.y - after.y).toFixed(1)}u)`);
});

scenario('camera-follow', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(400);
  const gap = await page.evaluate(() => {
    const { game } = window.fantastania;
    const p = game.scenes.active.player;
    return Math.hypot(game.camera.x - p.x, game.camera.y - p.y);
  });
  t.assert(gap < 90, `camera tracks the player (gap ${gap.toFixed(1)}u)`);
});

scenario('collision', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  // Park the player left of a known wall and push into it for a full second.
  await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    s.player.x = 1100;
    s.player.y = 900;
  });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyD');
  const pos = await t.playerPos(page);
  t.assert(pos.x < 1200, `wall stopped the player (x=${pos.x.toFixed(1)}, wall at 1200)`);
});

scenario('touch-joystick', 'phone', async (page, t) => {
  await t.waitForBoot(page);
  const before = await t.playerPos(page);
  // Drag in the left half of the screen: the joystick should spawn and steer.
  await page.touchscreen.tap(150, 300);
  const box = page.locator('#game-canvas');
  await box.dispatchEvent('pointerdown', {
    pointerId: 7, pointerType: 'touch', clientX: 150, clientY: 300, isPrimary: true, button: 0,
  });
  for (let i = 1; i <= 8; i++) {
    await box.dispatchEvent('pointermove', {
      pointerId: 7, pointerType: 'touch', clientX: 150 + i * 10, clientY: 300, isPrimary: true,
    });
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(350);
  const during = await t.playerPos(page);
  await box.dispatchEvent('pointerup', {
    pointerId: 7, pointerType: 'touch', clientX: 230, clientY: 300, isPrimary: true,
  });
  t.assert(during.x - before.x > 15, `joystick drove movement (${(during.x - before.x).toFixed(1)}u)`);

  const padVisible = await page.evaluate(() => window.fantastania.game.controls.pad.visible);
  t.assert(padVisible, 'touch controls became visible after a touch');
});

scenario('resize', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1600, height: 700 });
  await page.waitForTimeout(300);
  const view = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    return { w: r.viewWidth, h: r.viewHeight, cw: r.canvas.width, ch: r.canvas.height };
  });
  t.assert(view.h === 540 && view.cw > 0 && view.ch > 0, 'renderer survived aggressive resizing');
});

/* ------------------------------------------------------------------ */

/**
 * Finds a preinstalled Chromium. This environment ships browsers under
 * /opt/pw-browsers with a versioned directory name, so probe rather than
 * hard-code, and fall back to Playwright's own resolution.
 */
function chromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  // Any chromium-* directory will do.
  try {
    const { readdirSync } = require('node:fs');
    for (const dir of readdirSync('/opt/pw-browsers')) {
      const p = `/opt/pw-browsers/${dir}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  } catch { /* not this environment */ }
  return null;
}

const helpers = {
  async waitForBoot(page) {
    await page.waitForFunction(() => !!window.fantastania?.game, null, { timeout: 20000 });
    await page.waitForFunction(
      () => window.fantastania.game.scenes.active && window.fantastania.game.scenes.fade < 0.2,
      null,
      { timeout: 20000 },
    );
  },
  async playerPos(page) {
    return page.evaluate(() => {
      const p = window.fantastania.game.scenes.active.player;
      return { x: p.x, y: p.y };
    });
  },
  async settleAndReadFps(page) {
    await page.waitForTimeout(1200);
    return page.evaluate(() => window.fantastania.game.stats.fps);
  },
};

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const port = 4317 + Math.floor(Math.random() * 300);
  const server = await serve(port);
  const browser = await chromium.launch({
    ...(chromeBinary() ? { executablePath: chromeBinary() } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
  });

  let failures = 0;
  let checks = 0;

  const list = only.length ? scenarios.filter((s) => only.includes(s.name)) : scenarios;
  if (list.length === 0) {
    console.error(`No scenario matched: ${only.join(', ')}`);
    process.exitCode = 1;
  }

  for (const sc of list) {
    const context = await browser.newContext(VIEWPORTS[sc.viewport]);
    const page = await context.newPage();
    const problems = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
      if (msg.type() === 'warning' && /Unknown|missing|failed/i.test(msg.text())) {
        problems.push(`console.warn: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (req) => {
      // Favicon-ish misses are noise; anything else is a broken asset path.
      if (!/favicon/.test(req.url())) problems.push(`requestfailed: ${req.url()}`);
    });

    const t = {
      ...helpers,
      assert(cond, label) {
        checks++;
        if (cond) {
          console.log(`  ✓ ${label}`);
        } else {
          failures++;
          console.log(`  ✗ ${label}`);
        }
      },
    };

    console.log(`\n▶ ${sc.name} [${sc.viewport}]`);
    try {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
      await sc.fn(page, t);
      if (wantShots) {
        await page.screenshot({ path: join(SHOT_DIR, `${sc.name}.png`) });
      }
    } catch (err) {
      failures++;
      console.log(`  ✗ scenario threw: ${err.message}`);
    }

    if (problems.length) {
      failures += problems.length;
      for (const p of problems) console.log(`  ✗ ${p}`);
    } else {
      console.log('  ✓ no console errors or failed requests');
      checks++;
    }
    await context.close();
  }

  await browser.close();
  server.close();

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks`);
  process.exitCode = failures === 0 ? 0 : 1;
}

run();
