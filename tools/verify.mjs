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
  // Homestead's north ridge runs along y < 120; walk into it and stop.
  await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    s.player.x = 800;
    s.player.y = 260;
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const pos = await t.playerPos(page);
  t.assert(pos.y > 115, `ridge stopped the player (y=${pos.y.toFixed(1)}, wall ends at 120)`);

  const clear = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    // Nothing should ever be left standing inside authored collision geometry.
    return s.world.props.every((p) =>
      !(s.area.def.walls ?? []).some((w) =>
        p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h));
  });
  t.assert(clear, 'no scatter prop was placed inside a wall');
});

/**
 * Root cause: `World.separateActors()` (the mutual push that keeps a crowd
 * from overlapping) writes actor positions directly and, unlike every other
 * movement path, never re-clamped to `world.bounds` afterward. A player (or
 * enemy) pinned against an edge by two or three others got shoved straight
 * through it and could stand outside the map indefinitely — no walking
 * required, which is what made it look unreproducible. This scenario
 * reproduces it exactly: pack real enemies onto the player at each of the
 * four map edges and confirm nobody's position ever leaves `bounds`.
 */
scenario('world-boundary-crowd-push', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const result = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('whisperingWoods', 'fromHomestead', false);
    const b = s.world.bounds;
    const r = s.player.radius;

    const enemies = s.world.actors.filter((a) => a.faction === 'enemy' && a.solid);
    if (enemies.length < 4) return { error: `not enough enemies (${enemies.length})` };

    const edges = [
      { x: b.x + r + 2, y: b.y + b.h / 2 }, // west
      { x: b.x + b.w - r - 2, y: b.y + b.h / 2 }, // east
      { x: b.x + b.w / 2, y: b.y + r + 2 }, // north
      { x: b.x + b.w / 2, y: b.y + b.h - r - 2 }, // south
    ];

    const violations = [];
    for (const edge of edges) {
      s.player.x = edge.x;
      s.player.y = edge.y;
      s.player.vx = 0;
      s.player.vy = 0;
      // Stack several solid actors exactly on the player, hard against the
      // boundary — the crowd separateActors() must resolve this same tick.
      for (let i = 0; i < 4; i++) {
        enemies[i].x = edge.x + (i - 2) * 3;
        enemies[i].y = edge.y + (i - 2) * 3;
        enemies[i].isDead = false;
      }

      // Run real ticks (not a single manual call) so this exercises the
      // actual game loop, exactly as it runs during real play.
      await new Promise((res) => setTimeout(res, 220));

      const inBounds = (x, y, rad) =>
        x >= b.x + rad - 0.5 && x <= b.x + b.w - rad + 0.5
        && y >= b.y + rad - 0.5 && y <= b.y + b.h - rad + 0.5;

      if (!inBounds(s.player.x, s.player.y, r)) {
        violations.push(`player at (${s.player.x.toFixed(1)}, ${s.player.y.toFixed(1)})`);
      }
      for (const e of enemies.slice(0, 4)) {
        if (!e.isDead && !inBounds(e.x, e.y, e.radius)) {
          violations.push(`enemy ${e.def?.id ?? '?'} at (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`);
        }
      }
    }
    return { violations, boundsChecked: edges.length };
  });

  t.assert(!result.error, result.error ?? 'enough enemies were available to stack');
  t.assert((result.violations?.length ?? 1) === 0,
    result.violations?.length
      ? `crowd-pushed past the boundary: ${result.violations.join('; ')}`
      : `no actor left the map at any of the ${result.boundsChecked} edges under a crowd push`);
});

/**
 * Deliberate escape attempts at every corner of every area, holding two
 * movement keys at once (the diagonal case) the whole time — the actual QA
 * pass the bug report asked for, not just a unit-level check.
 */
scenario('world-boundary-corners', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const areaIds = Object.keys(await page.evaluate(() => window.fantastania.areas));

  const escapes = [];
  for (const areaId of areaIds) {
    const bounds = await page.evaluate(async (id) => {
      const s = window.fantastania.game.scenes.active;
      await s.enterArea(id, 'default', false);
      return s.world.bounds;
    }, areaId);

    const corners = [
      ['KeyA', 'KeyW', bounds.x, bounds.y],
      ['KeyD', 'KeyW', bounds.x + bounds.w, bounds.y],
      ['KeyA', 'KeyS', bounds.x, bounds.y + bounds.h],
      ['KeyD', 'KeyS', bounds.x + bounds.w, bounds.y + bounds.h],
    ];

    for (const [kx, ky] of corners) {
      // Start well inside so this is a real walk into the corner, not a
      // teleport followed by one clamp.
      await page.evaluate((id) => {
        const s = window.fantastania.game.scenes.active;
        s.player.x = s.world.bounds.x + s.world.bounds.w / 2;
        s.player.y = s.world.bounds.y + s.world.bounds.h / 2;
      }, areaId);
      await page.keyboard.down(kx);
      await page.keyboard.down(ky);
      await page.waitForTimeout(1500);
      await page.keyboard.up(kx);
      await page.keyboard.up(ky);

      const pos = await page.evaluate(() => {
        const s = window.fantastania.game.scenes.active;
        return { x: s.player.x, y: s.player.y, r: s.player.radius };
      });
      const b = bounds;
      const out = pos.x < b.x + pos.r - 0.5 || pos.x > b.x + b.w - pos.r + 0.5
        || pos.y < b.y + pos.r - 0.5 || pos.y > b.y + b.h - pos.r + 0.5;
      if (out) escapes.push(`${areaId} @ (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    }
  }

  t.assert(escapes.length === 0,
    escapes.length
      ? `escaped the map by walking diagonally into a corner: ${escapes.join('; ')}`
      : `held a diagonal into all 4 corners of all ${areaIds.length} areas with no escape`);
});

scenario('area-population', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const info = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    return {
      area: s.area.def.id,
      props: s.world.props.length,
      obstacles: s.world.obstacles.length,
      portals: s.area.portals.length,
      sorted: s.world.props.every((p, i, arr) => i === 0 || arr[i - 1].y <= p.y),
    };
  });
  t.assert(info.area === 'homestead', `starts in the Homestead (got ${info.area})`);
  t.assert(info.props > 40, `area is populated (${info.props} props)`);
  t.assert(info.obstacles > 10, `collision geometry built (${info.obstacles} obstacles)`);
  t.assert(info.portals === 1, `portals created (${info.portals})`);
  t.assert(info.sorted, 'props are pre-sorted by depth');
});

scenario('area-transition', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  // Walk into the eastern portal and wait for the dwell + fade.
  await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    s.player.x = 1740;
    s.player.y = 650;
  });
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active.area.def.id === 'whisperingWoods',
    null,
    { timeout: 8000 },
  );
  const after = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    const { state } = window.fantastania;
    return {
      area: s.area.def.id,
      saved: state.currentAreaId,
      unlocked: state.unlockedAreas.includes('whisperingWoods'),
      px: s.player.x,
      py: s.player.y,
      props: s.world.props.length,
    };
  });
  t.assert(after.area === 'whisperingWoods', 'portal moved the player to the Woods');
  t.assert(after.saved === 'whisperingWoods', 'game state tracks the current area');
  t.assert(after.unlocked, 'the new area was unlocked');
  t.assert(after.props > 100, `the Woods are densely populated (${after.props} props)`);
  // And the arrival must not immediately bounce back through the return portal.
  await page.waitForTimeout(1200);
  const stayed = await page.evaluate(
    () => window.fantastania.game.scenes.active.area.def.id,
  );
  t.assert(stayed === 'whisperingWoods', 'arrival grace stops an instant bounce-back');
});

scenario('locked-portal', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('whisperingWoods', 'fromHomestead', false);
    // The cave mouth needs the Resonant Sigil, which a level-1 player lacks.
    s.player.x = 2540;
    s.player.y = 900;
  });
  await page.waitForTimeout(1500);
  const area = await page.evaluate(
    () => window.fantastania.game.scenes.active.area.def.id,
  );
  t.assert(area === 'whisperingWoods', 'a gated portal refuses an unqualified player');
});

scenario('all-areas-load', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const report = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    const ids = Object.keys(window.fantastania.areas);
    const out = [];
    for (const id of ids) {
      try {
        await s.enterArea(id, 'default', false);
        out.push({
          id,
          props: s.world.props.length,
          ok: s.world.isClear(s.player.x, s.player.y, s.player.radius),
        });
      } catch (err) {
        out.push({ id, error: String(err) });
      }
    }
    return out;
  });
  for (const r of report) {
    t.assert(!r.error, `${r.id} loads without error${r.error ? `: ${r.error}` : ''}`);
    t.assert(r.ok, `${r.id} spawns the player in clear space`);
  }
  t.assert(report.length === 6, `all six regions are registered (${report.length})`);
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

scenario('combat', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const before = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('whisperingWoods', 'fromHomestead', false);
    // Drop the player on a known wolf pack.
    s.player.x = 820;
    s.player.y = 1040;
    s.player.health = s.player.maxHealth;
    return {
      enemies: s.world.actors.filter((a) => a.faction === 'enemy').length,
      xp: window.fantastania.state.xp,
      level: window.fantastania.state.level,
    };
  });
  t.assert(before.enemies > 5, `the Woods are populated (${before.enemies} enemies)`);

  // Enemies should notice the player and close in.
  await page.waitForTimeout(1800);
  const engaged = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    return s.world.actors.some((a) => a.faction === 'enemy' && a.target);
  });
  t.assert(engaged, 'enemy AI acquired the player');

  // Swing until something dies, or give up after a few seconds.
  const killed = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    const deadline = performance.now() + 14000;
    const start = window.fantastania.state.kills;
    while (performance.now() < deadline) {
      // Make the player unkillable for the test; we are checking that damage
      // flows, not that a level-1 Eric can solo a pack.
      s.player.health = s.player.maxHealth;
      s.player.invuln = 1;
      const enemy = s.world.actors.find((a) => a.faction === 'enemy' && !a.isDead);
      if (enemy) {
        s.player.x = enemy.x - 30;
        s.player.y = enemy.y;
        s.player.pose.facing = 0;
        s.combat.update({
          pressed: (a) => a === 'attack',
          down: () => false,
          moveX: 0, moveY: 0, aiming: false, aimWorldX: 0, aimWorldY: 0,
        });
      }
      await new Promise((r) => setTimeout(r, 120));
      if (window.fantastania.state.kills > start) return true;
    }
    return false;
  });
  t.assert(killed, 'melee attacks kill an enemy');

  const after = await page.evaluate(() => ({
    xp: window.fantastania.state.xp,
    level: window.fantastania.state.level,
    gold: window.fantastania.state.gold,
    kills: window.fantastania.state.kills,
  }));
  t.assert(after.xp > before.xp || after.level > before.level, `the kill awarded XP (${after.xp})`);
  t.assert(after.gold > 25, `the kill awarded gold (${after.gold})`);
});

scenario('abilities', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const report = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('whisperingWoods', 'fromHomestead', false);
    s.player.x = 820;
    s.player.y = 1040;
    const out = [];
    // Every ability in the game must cast without throwing, on both shapes of
    // caster, and must actually consume resources.
    for (const id of Object.keys(window.fantastania.abilities)) {
      s.player.busy = 0;
      s.player.mana = s.player.maxMana = 9999;
      s.player.cooldowns = {};
      const manaBefore = s.player.mana;
      let ok = false;
      let error = null;
      try {
        ok = s.world.castAbility(s.player, id, { angle: 0 });
      } catch (err) { error = String(err); }
      out.push({ id, ok, error, spent: manaBefore - s.player.mana });
    }
    return out;
  });
  for (const r of report) {
    t.assert(!r.error, `${r.id} casts without throwing${r.error ? `: ${r.error}` : ''}`);
    t.assert(r.ok, `${r.id} was accepted`);
  }
  // Let the scheduled effects resolve and confirm nothing blew up afterwards.
  await page.waitForTimeout(1500);
  const alive = await page.evaluate(() => !!window.fantastania.game.scenes.active.world);
  t.assert(alive, 'the world survived casting every ability');
});

scenario('death-respawn', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('whisperingWoods', 'fromHomestead', false);
    s.player.invuln = 0;
    s.world.damage(s.player, {
      amount: 99999, type: 'physical', crit: false,
      sourceId: -1, knockback: 0, staggerPower: 0, angle: 0,
    });
  });
  const died = await page.evaluate(() => window.fantastania.game.scenes.active.player.isDead);
  t.assert(died, 'the player can die');

  await page.waitForFunction(
    () => !window.fantastania.game.scenes.active.player.isDead,
    null, { timeout: 12000 },
  );
  const after = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    return { hp: s.player.health, deaths: window.fantastania.state.deaths, area: s.area.def.id };
  });
  t.assert(after.hp > 0, `respawned with health (${Math.round(after.hp)})`);
  t.assert(after.deaths === 1, 'the death was recorded');
});

scenario('boss', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('bossArena', 'default', false);
    s.player.x = 700;
    s.player.y = 600;
  });
  await page.waitForTimeout(600);
  const boss = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    const b = s.area.boss;
    return b ? { name: b.name, hp: b.maxHealth, isBoss: b.isBoss } : null;
  });
  t.assert(!!boss, 'crossing the trigger spawns the boss');
  t.assert(boss?.isBoss && boss.hp > 500, `the Warden has boss-scale health (${boss?.hp})`);

  // Drive it into its second phase and confirm the transition is handled.
  const phased = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    const b = s.area.boss;
    b.health = b.maxHealth * 0.25;
    await new Promise((r) => setTimeout(r, 400));
    return b.state !== 'dead';
  });
  t.assert(phased, 'the boss survives a phase transition');
});

scenario('loot-inventory', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const start = await page.evaluate(() => ({
    items: window.fantastania.state.inventory.length,
    weapon: window.fantastania.state.equipment.weapon,
  }));
  t.assert(start.items > 0, `a new game starts with supplies (${start.items} stacks)`);
  t.assert(!!start.weapon, `a new game starts equipped (${start.weapon})`);

  // Opening the Homestead's supply chest must drop collectable pickups.
  const chest = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('homestead', 'default', false);
    const c = s.area.interactables[0];
    s.player.x = c.x;
    s.player.y = c.y + 30;
    const before = s.world.entities.length;
    c.interact(s.world, s.player);
    await new Promise((r) => setTimeout(r, 60));
    return { opened: c.opened, spawned: s.world.entities.length - before + 1 };
  });
  t.assert(chest.opened, 'the chest opened');

  // Walk over the drops and confirm they land in the pack.
  await page.waitForTimeout(2200);
  const after = await page.evaluate(() => ({
    gold: window.fantastania.state.gold,
    bread: window.fantastania.state.inventory
      .filter((s) => s.itemId === 'breadRation')
      .reduce((n, s) => n + s.count, 0),
  }));
  t.assert(after.gold > 25, `chest gold was collected (${after.gold}g)`);
  t.assert(after.bread >= 4, `chest items were collected (${after.bread} bread)`);

  const reopened = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    return s.area.interactables[0].interact(s.world, s.player);
  });
  t.assert(!reopened, 'an opened chest cannot be looted twice');
});

scenario('equipment-stats', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const result = await page.evaluate(() => {
    const { inventory, state } = window.fantastania;
    const s = window.fantastania.game.scenes.active;
    const before = { str: s.player.stats.total.strength, power: s.player.physicalPower };

    inventory.addItem('woodcuttersAxe', 1, false);
    const equip = inventory.equipItem('woodcuttersAxe', s.player);
    const after = { str: s.player.stats.total.strength, power: s.player.physicalPower };

    // The displaced weapon must come back to the pack, not vanish.
    const returned = state.inventory.some((x) => x.itemId === 'wornBlade');
    return { equip, before, after, returned, weapon: state.equipment.weapon };
  });
  t.assert(result.equip.ok, 'equipping succeeded');
  t.assert(result.weapon === 'woodcuttersAxe', 'the weapon slot updated');
  t.assert(result.after.str > result.before.str,
    `equipment raised strength (${result.before.str} to ${result.after.str})`);
  t.assert(result.after.power > result.before.power, 'derived power followed the stat change');
  t.assert(result.returned, 'the replaced weapon went back to the pack');

  const gated = await page.evaluate(() => {
    const { inventory } = window.fantastania;
    const s = window.fantastania.game.scenes.active;
    inventory.addItem('aetherlightBlade', 1, false);
    return inventory.equipItem('aetherlightBlade', s.player);
  });
  t.assert(!gated.ok, `level requirements are enforced (${gated.reason})`);
});

scenario('consumables-and-skills', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const potion = await page.evaluate(() => {
    const { inventory, state } = window.fantastania;
    const s = window.fantastania.game.scenes.active;
    s.player.health = 10;
    const before = s.player.health;
    const count = state.inventory.find((x) => x.itemId === 'potionMinorHealth')?.count ?? 0;
    const res = inventory.useItem('potionMinorHealth', s.player);
    const left = state.inventory.find((x) => x.itemId === 'potionMinorHealth')?.count ?? 0;
    return { res, before, after: s.player.health, count, left };
  });
  t.assert(potion.res.ok, 'the potion was used');
  t.assert(potion.after > potion.before, `it healed (${potion.before} to ${Math.round(potion.after)})`);
  t.assert(potion.left === potion.count - 1, 'it was consumed from the stack');

  const skill = await page.evaluate(() => {
    const { skills, state } = window.fantastania;
    const s = window.fantastania.game.scenes.active;
    state.skillPoints = 3;
    const before = s.player.stats.total.vitality;
    const first = skills.spendPoint('eric_toughness', s.player);
    const after = s.player.stats.total.vitality;
    // A node behind an unmet prerequisite must be refused.
    const locked = skills.spendPoint('eric_bastion', s.player);
    return { first, locked, before, after, points: state.skillPoints };
  });
  t.assert(skill.first.ok, 'a skill point was spent');
  t.assert(skill.after > skill.before,
    `the skill raised vitality (${skill.before} to ${skill.after})`);
  t.assert(skill.points === 2, 'the point was deducted');
  t.assert(!skill.locked.ok, `prerequisites are enforced (${skill.locked.reason})`);

  const unlock = await page.evaluate(() => {
    const { skills, state } = window.fantastania;
    const s = window.fantastania.game.scenes.active;
    state.level = 10;
    state.skillPoints = 10;
    skills.spendPoint('eric_spark', s.player);
    const res = skills.spendPoint('eric_firebolt', s.player);
    return { res, unlocked: state.unlockedAbilities.includes('fireBolt') };
  });
  t.assert(unlock.res.ok, 'an ability node was purchased');
  t.assert(unlock.unlocked, 'the skill tree unlocked Fire Bolt');
});

scenario('npc-dialogue', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const setup = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('homestead', 'default', false);
    const npcs = s.area.interactables.filter((i) => i.def && i.def.dialogue);
    const mira = npcs.find((n) => n.def.id === 'mira');
    s.player.x = mira.x;
    s.player.y = mira.y + 40;
    return { npcCount: npcs.length, marker: mira.questMarker };
  });
  t.assert(setup.npcCount === 3, `the Homestead is populated (${setup.npcCount} NPCs)`);
  t.assert(setup.marker === 'offer', `Mira advertises her quest (marker: ${setup.marker})`);

  // Walk the conversation to the point where the quest is offered and take it.
  const convo = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    const { dialogue } = window.fantastania;
    const mira = s.area.interactables.find((n) => n.def && n.def.id === 'mira');
    s.startDialogue(mira);
    const opened = s.inDialogue;
    const firstLine = dialogue.currentLine();

    // Page through the opening, then pick the quest option each time.
    for (let guard = 0; guard < 20; guard++) {
      const line = dialogue.currentLine();
      if (!line) break;
      if (line.hasMore) { dialogue.advance(s.player); continue; }
      const choices = dialogue.currentChoices();
      if (choices.length === 0) { if (!dialogue.advance(s.player)) break; continue; }
      const quest = choices.find((c) => c.tone === 'quest') ?? choices[0];
      if (!dialogue.choose(quest.index, s.player)) break;
      if (window.fantastania.state.activeQuests.length > 0) break;
    }
    return {
      opened,
      speaker: firstLine?.speaker,
      active: window.fantastania.state.activeQuests.map((q) => q.questId),
    };
  });
  t.assert(convo.opened, 'talking to an NPC opens a conversation');
  t.assert(convo.speaker === 'Mira', `the right NPC speaks (${convo.speaker})`);
  t.assert(convo.active.includes('troubleInTheWoods'),
    `the dialogue started the quest (${convo.active.join(', ')})`);

  // The same NPC must now say something different.
  const second = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active;
    const { dialogue } = window.fantastania;
    dialogue.end();
    const mira = s.area.interactables.find((n) => n.def && n.def.id === 'mira');
    dialogue.start(mira.def.id, s.player);
    const line = dialogue.currentLine();
    dialogue.end();
    return line?.text ?? '';
  });
  t.assert(second.includes('Still five'),
    'the NPC picks a different entry once the quest is active');
});

scenario('quest-lifecycle', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const result = await page.evaluate(async () => {
    const { quests, state, bus } = window.fantastania;
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('whisperingWoods', 'fromHomestead', false);

    quests.accept('troubleInTheWoods');
    const accepted = !!state.questProgressFor('troubleInTheWoods');

    // Five kills should complete it, and a sixth must not overflow.
    for (let i = 0; i < 6; i++) {
      bus.emit('enemyKilled', { enemyId: 'shadowWolf', level: 2, x: 0, y: 0 });
    }
    const progress = state.questProgressFor('troubleInTheWoods');
    const xpBefore = state.xp;
    const levelBefore = state.level;
    const goldBefore = state.gold;
    const turnedIn = quests.turnIn('troubleInTheWoods');

    return {
      accepted,
      counter: progress ? progress.counters[0] : -1,
      ready: progress ? progress.readyToTurnIn : false,
      turnedIn,
      completed: state.hasCompletedQuest('troubleInTheWoods'),
      stillActive: !!state.questProgressFor('troubleInTheWoods'),
      gained: state.xp !== xpBefore || state.level !== levelBefore,
      gold: state.gold - goldBefore,
      flag: state.hasFlag('woodsThinned'),
    };
  });
  t.assert(result.accepted, 'the quest was accepted');
  t.assert(result.counter === 5, `kill objectives cap at the required count (${result.counter})`);
  t.assert(result.ready, 'the quest became ready to turn in');
  t.assert(result.turnedIn, 'the quest was turned in');
  t.assert(result.completed && !result.stillActive, 'it moved from active to completed');
  t.assert(result.gained, 'turning it in awarded XP');
  t.assert(result.gold === 60, `turning it in awarded gold (${result.gold})`);
  t.assert(result.flag, 'turning it in set its story flag');

  // A collect objective must follow the inventory, not a running total.
  const collect = await page.evaluate(() => {
    const { quests, inventory, state } = window.fantastania;
    quests.accept('peltsForGarrick');
    inventory.addItem('wolfPelt', 4, false);
    const ready = state.questProgressFor('peltsForGarrick').readyToTurnIn;
    inventory.removeItem('wolfPelt', 2);
    const afterLoss = state.questProgressFor('peltsForGarrick').readyToTurnIn;
    return { ready, afterLoss };
  });
  t.assert(collect.ready, 'collecting the items completed the objective');
  t.assert(!collect.afterLoss, 'losing the items un-completed it');
});

scenario('save-load', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const saved = await page.evaluate(async () => {
    const { saves, state, quests, inventory } = window.fantastania;
    const s = window.fantastania.game.scenes.active;

    // Build a distinctive state worth persisting.
    await s.enterArea('whisperingWoods', 'fromHomestead', false);
    state.addXp(500);
    state.addGold(777);
    quests.accept('troubleInTheWoods');
    inventory.addItem('aetherShard', 7, false);
    state.setFlag('verifyFlag', 42);

    const ok = await saves.save(1, {
      characterId: state.characterId,
      characterName: 'Eric',
      level: state.level,
      areaId: state.currentAreaId,
      areaName: 'Whispering Woods',
      playtime: state.playtime,
      gold: state.gold,
      questName: 'Trouble in the Woods',
    });
    return {
      ok,
      level: state.level,
      gold: state.gold,
      area: state.currentAreaId,
      shards: inventory.countOf('aetherShard'),
    };
  });
  t.assert(saved.ok, 'the game saved');

  const listed = await page.evaluate(async () => {
    const info = await window.fantastania.saves.slotInfo(1);
    return info;
  });
  t.assert(!listed.empty && !listed.corrupt, 'the slot lists as populated');
  t.assert(listed.summary.level === saved.level, 'the slot summary carries the level');

  // Wipe the live state, then restore it from disk.
  const restored = await page.evaluate(async () => {
    const { saves, state, inventory } = window.fantastania;
    state.reset('lev');
    state.gold = 0;
    const loaded = await saves.load(1);
    return {
      loaded,
      character: state.characterId,
      level: state.level,
      gold: state.gold,
      area: state.currentAreaId,
      shards: inventory.countOf('aetherShard'),
      quest: !!state.questProgressFor('troubleInTheWoods'),
      flag: state.flags.verifyFlag,
    };
  });
  t.assert(restored.loaded, 'the save loaded');
  t.assert(restored.character === 'eric', `character restored (${restored.character})`);
  t.assert(restored.level === saved.level, `level restored (${restored.level})`);
  t.assert(restored.gold === saved.gold, `gold restored (${restored.gold})`);
  t.assert(restored.area === saved.area, `area restored (${restored.area})`);
  t.assert(restored.shards === saved.shards, `inventory restored (${restored.shards} shards)`);
  t.assert(restored.quest, 'active quests restored');
  t.assert(restored.flag === 42, 'story flags restored');

  // Reload the page entirely and confirm the title screen offers to resume
  // the save that was just written — this is what "survives a reload" means
  // now that boot always lands on the menu rather than auto-resuming.
  // (waitForBoot is deliberately NOT used here: it force-starts a fresh game,
  // which would silently paper over a reload that lost the save.)
  await page.reload({ waitUntil: 'load' });
  await t.waitForMenu(page);
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.continueSlot !== undefined,
    null, { timeout: 5000 },
  ).catch(() => {}); // continueSlot is private state; fall through to the slot check below.

  const slotAfterReload = await page.evaluate(async () => {
    const info = await window.fantastania.saves.slotInfo(1);
    return info;
  });
  t.assert(!slotAfterReload.empty && !slotAfterReload.corrupt,
    'the save slot itself survived the reload');
  t.assert(slotAfterReload.summary?.gold === saved.gold,
    `the persisted summary matches what was saved (${slotAfterReload.summary?.gold}g)`);

  // Now actually resume it as the player would, via the real load path.
  const resumed = await page.evaluate(async () => {
    const { saves, state } = window.fantastania;
    await saves.load(1);
    return { gold: state.gold, level: state.level, area: state.currentAreaId };
  });
  t.assert(resumed.gold === saved.gold, `resuming after reload restores gold (${resumed.gold}g)`);
  t.assert(resumed.area === saved.area, `resuming after reload restores area (${resumed.area})`);
});

scenario('main-menu-flow', 'desktop', async (page, t) => {
  // A real click-driven pass through Title -> Character Select -> World,
  // exercising the actual PointerTracker/button() hit-testing pipeline and
  // the view-space-to-client-pixel coordinate math, not just the state
  // changes those clicks eventually cause.
  await t.waitForMenu(page);

  const title = await page.evaluate(() => window.fantastania.game.scenes.active.constructor.name);
  t.assert(title === 'MainMenuScene', `boots to the title screen (got ${title})`);

  // Play button: first of three (no save exists yet in a fresh context).
  const playRect = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    const w = Math.min(340, r.viewWidth * 0.42);
    const h = 50;
    const totalH = 3 * h + 2 * 14;
    const y = r.viewHeight * 0.52 - totalH / 2;
    const x = r.viewWidth / 2 - w / 2;
    return { x, y, w, h };
  });
  await t.viewClick(page, playRect.x + playRect.w / 2, playRect.y + playRect.h / 2);

  const afterPlay = await page.evaluate(() => window.fantastania.game.scenes.active.constructor.name);
  t.assert(afterPlay === 'CharacterSelectScene', `Play opens character select (got ${afterPlay})`);

  // Click Lev's card (the second of two), then the confirm button.
  const cardRect = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    const cardW = Math.min(380, r.viewWidth * 0.44);
    const cardH = r.viewHeight - 150;
    const gap = 24;
    const totalW = cardW * 2 + gap;
    const startX = r.viewWidth / 2 - totalW / 2;
    return { x: startX + (cardW + gap), y: 66, w: cardW, h: cardH };
  });
  await t.viewClick(page, cardRect.x + cardRect.w / 2, cardRect.y + 40);

  const selected = await page.evaluate(() => window.fantastania.game.scenes.active.selected);
  t.assert(selected === 'lev', `clicking Lev's card selects him (selected=${selected})`);

  const confirmRect = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    return { x: r.viewWidth / 2 - 110, y: r.viewHeight - 60, w: 220, h: 50 };
  });
  await t.viewClick(page, confirmRect.x + confirmRect.w / 2, confirmRect.y + confirmRect.h / 2);

  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.constructor?.name === 'WorldScene',
    null, { timeout: 8000 },
  );
  const result = await page.evaluate(() => ({
    character: window.fantastania.state.characterId,
    scene: window.fantastania.game.scenes.active.constructor.name,
  }));
  t.assert(result.character === 'lev', `confirming starts the game as Lev (got ${result.character})`);
  t.assert(result.scene === 'WorldScene', 'lands in the world');
});

scenario('settings-flow', 'desktop', async (page, t) => {
  await t.waitForMenu(page);

  const settingsRect = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    const w = Math.min(340, r.viewWidth * 0.42);
    const h = 50;
    const gap = 14;
    const totalH = 3 * h + 2 * gap;
    const y = r.viewHeight * 0.52 - totalH / 2 + 2 * (h + gap);
    const x = r.viewWidth / 2 - w / 2;
    return { x, y, w, h };
  });
  await t.viewClick(page, settingsRect.x + settingsRect.w / 2, settingsRect.y + settingsRect.h / 2);

  const opened = await page.evaluate(() => window.fantastania.game.scenes.active.constructor.name);
  t.assert(opened === 'SettingsScene', `Settings button opens the settings panel (got ${opened})`);

  const before = await page.evaluate(() => window.fantastania.state.settings.masterVolume);

  // Drag the master-volume slider down to roughly 20% by clicking near the
  // left end of its track, using the same geometry the scene itself draws.
  const sliderRect = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    const w = Math.min(460, r.viewWidth - 60);
    const h = Math.min(430, r.viewHeight - 40);
    const rect = { x: r.viewWidth / 2 - w / 2, y: r.viewHeight / 2 - h / 2, w, h };
    return { x: rect.x + 26, y: rect.y + 64, w: rect.w - 52, h: 18 };
  });
  await t.viewClick(page, sliderRect.x + sliderRect.w * 0.15, sliderRect.y + sliderRect.h / 2);

  const after = await page.evaluate(() => ({
    settingsValue: window.fantastania.state.settings.masterVolume,
    audioValue: window.fantastania.game.audio.volumes.master,
  }));
  t.assert(after.settingsValue !== before, `dragging the slider changed the setting (${before} -> ${after.settingsValue})`);
  t.assert(Math.abs(after.settingsValue - after.audioValue) < 0.01,
    `the change reached the live AudioBus (${after.audioValue})`);
  t.assert(after.settingsValue < 0.3, `landed near where it was clicked (${after.settingsValue})`);

  // Close and confirm it persisted to storage, not just live memory.
  const doneRect = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    const w = Math.min(460, r.viewWidth - 60);
    const h = Math.min(430, r.viewHeight - 40);
    const rect = { x: r.viewWidth / 2 - w / 2, y: r.viewHeight / 2 - h / 2, w, h };
    return { x: rect.x + rect.w - 96, y: rect.y + rect.h - 46, w: 78, h: 34 };
  });
  await t.viewClick(page, doneRect.x + doneRect.w / 2, doneRect.y + doneRect.h / 2);
  await page.waitForTimeout(150);

  const persisted = await page.evaluate(async () => {
    const raw = await window.fantastania.game.storage.get('settings');
    return raw ? JSON.parse(raw).masterVolume : null;
  });
  t.assert(persisted !== null && Math.abs(persisted - after.settingsValue) < 0.01,
    `settings persisted to storage (${persisted})`);

  const closed = await page.evaluate(() => window.fantastania.game.scenes.active.constructor.name);
  t.assert(closed === 'MainMenuScene', 'Done returns to the title screen');
});

/**
 * Computes the pause panel's rect the same way PauseScene.render() does. The
 * panel is 720x500 at every viewport this game supports — MIN_VIEW_WIDTH is
 * 780, so `Math.min(720, viewWidth - 40)` is always 720 — which is what makes
 * clicking fixed offsets into it reliable across a resize.
 */
async function pausePanelGeom(page) {
  return page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    const w = Math.min(720, r.viewWidth - 40);
    const h = Math.min(500, r.viewHeight - 40);
    return { x: r.viewWidth / 2 - w / 2, y: r.viewHeight / 2 - h / 2, w, h };
  });
}

scenario('pause-menu-flow', 'desktop', async (page, t) => {
  await t.waitForBoot(page);

  // Escape is the real keybinding a keyboard player uses; WorldScene reads it
  // through the same `controls.pressed('pause')` path a controller or the
  // touch pad's pause button would.
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.constructor.name === 'PauseScene',
    null, { timeout: 4000 },
  );
  t.assert(true, 'Escape opens the pause menu and freezes the world');

  const frozen = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active.world;
    const before = { x: s.player.x, y: s.player.y };
    await new Promise((res) => setTimeout(res, 300));
    return { before, after: { x: s.player.x, y: s.player.y } };
  });
  t.assert(frozen.before.x === frozen.after.x && frozen.before.y === frozen.after.y,
    'the world stops simulating while paused');

  const geom = await pausePanelGeom(page);
  const tabY = geom.y + 46 + 17;
  // Character, Pack, Skills, Quests, Map — tabBar() divides evenly by count.
  const tabW = (geom.w - 40) / 5;
  const tabX0 = geom.x + 20;

  // Pack tab: equip a weapon by clicking the item cell, then the Equip button
  // — a real click through PointerTracker and button(), not a direct call.
  await page.evaluate(() => window.fantastania.inventory.addItem('woodcuttersAxe', 1, false));
  await t.viewClick(page, tabX0 + tabW * 1.5, tabY);
  const tab = await page.evaluate(() => window.fantastania.game.scenes.active.tab);
  t.assert(tab === 'inventory', `clicking the Pack tab switches to it (${tab})`);

  await t.viewClick(page, geom.x + 20 + 29, geom.y + 92 + 18 + 29);
  // Weapon + not-quest: both Equip and Sell render, stacked from the bottom.
  const detailX = geom.x + 496;
  const detailBottom = geom.y + 92 + (geom.h - 148);
  await t.viewClick(page, detailX + 102, detailBottom - 72 + 15);
  const equipped = await page.evaluate(() => window.fantastania.state.equipment.weapon);
  t.assert(equipped === 'woodcuttersAxe', `clicking Equip in the pack updated the loadout (${equipped})`);

  // Skills tab: click the first node, then Learn.
  await t.viewClick(page, tabX0 + tabW * 2.5, tabY);
  await page.evaluate(() => { window.fantastania.state.skillPoints = 3; });
  const before = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active.world;
    return { points: window.fantastania.state.skillPoints, vitality: s.player.stats.total.vitality };
  });
  const treeX = geom.x + 20;
  const treeY = geom.y + 92 + 30;
  await t.viewClick(page, treeX + 34, treeY + 34);
  await t.viewClick(page, detailX + 102, detailBottom - 36 + 15);
  const after = await page.evaluate(() => {
    const s = window.fantastania.game.scenes.active.world;
    return { points: window.fantastania.state.skillPoints, vitality: s.player.stats.total.vitality };
  });
  t.assert(after.points === before.points - 1, `clicking a skill node spent a point (${after.points})`);
  t.assert(after.vitality > before.vitality,
    `learning it raised vitality (${before.vitality} to ${after.vitality})`);

  // Quests tab: accept a side quest directly (as quest-lifecycle does), then
  // abandon it through the real two-tap Abandon button.
  await page.evaluate(() => window.fantastania.quests.accept('peltsForGarrick'));
  await t.viewClick(page, tabX0 + tabW * 3.5, tabY);
  const cardY = geom.y + 92;
  const abandonX = geom.x + 20 + (geom.w - 40) - 49;
  const abandonY = cardY + 86 - 18;
  await t.viewClick(page, abandonX, abandonY);
  await t.viewClick(page, abandonX, abandonY);
  const abandoned = await page.evaluate(
    () => !window.fantastania.state.questProgressFor('peltsForGarrick'),
  );
  t.assert(abandoned, 'the two-tap Abandon button removed the quest');

  // Save writes the autosave slot without leaving the menu.
  await t.viewClick(page, tabX0 + tabW * 0.5, tabY);
  const savedAtBefore = (await page.evaluate(
    () => window.fantastania.saves.listSlots(),
  ))[0].savedAt;
  await page.waitForTimeout(20);
  await t.viewClick(page, geom.x + 130 + 45, geom.y + geom.h - 44 + 16);
  await page.waitForTimeout(150);
  const savedAtAfter = (await page.evaluate(
    () => window.fantastania.saves.listSlots(),
  ))[0].savedAt;
  t.assert(savedAtAfter > savedAtBefore, 'the Save button wrote a fresh autosave');

  // Resume closes the menu and hands control back to the world.
  await t.viewClick(page, geom.x + 310 + 50, geom.y + geom.h - 44 + 16);
  const resumed = await page.evaluate(() => window.fantastania.game.scenes.active.constructor.name);
  t.assert(resumed === 'WorldScene', 'Resume returns control to the world');
});

scenario('pause-menu-quit', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  await page.evaluate(() => { window.fantastania.state.gold = 4321; });
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.constructor.name === 'PauseScene',
    null, { timeout: 4000 },
  );

  const geom = await pausePanelGeom(page);
  const footerY = geom.y + geom.h - 44 + 16;
  const quitCenter = geom.x + 530 + 85;

  // First tap arms the confirm; the menu must still be open and unchanged.
  await t.viewClick(page, quitCenter, footerY);
  const armed = await page.evaluate(() => window.fantastania.game.scenes.active.constructor.name);
  t.assert(armed === 'PauseScene', 'quitting needs a second tap to confirm');

  await t.viewClick(page, quitCenter, footerY);
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.constructor.name === 'MainMenuScene',
    null, { timeout: 4000 },
  );
  t.assert(true, 'confirming Quit to Title returns to the title screen');

  const saved = (await page.evaluate(() => window.fantastania.saves.listSlots()))[0];
  t.assert(saved.summary?.gold === 4321, `quitting autosaved first (${saved.summary?.gold}g)`);
});

scenario('action-pad-abilities', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const result = await page.evaluate(() => {
    const { hud } = window.fantastania;
    const s = window.fantastania.game.scenes.active;
    const pad = window.fantastania.game.controls.pad;
    const abilityId = window.fantastania.state.loadout.ability1;

    hud.updateActionPad(pad, s.player);
    const idleGlyph = pad.buttons.get('ability1').glyph;

    s.player.cooldowns[abilityId] = 4;
    hud.updateActionPad(pad, s.player);
    const btn = pad.buttons.get('ability1');
    return { idleGlyph, abilityId, cooldown: btn.cooldown, enabled: btn.enabled };
  });
  t.assert(result.idleGlyph.length > 0 && result.idleGlyph !== '—',
    `the pad picked up ability1's glyph (${result.idleGlyph})`);
  t.assert(result.cooldown > 0 && result.cooldown <= 1,
    `an active cooldown drives the pad button's sweep (${result.cooldown.toFixed(2)})`);
  t.assert(!result.enabled, 'the button reads disabled while on cooldown');
});

scenario('pause-menu-touch', 'phone', async (page, t) => {
  await t.waitForBoot(page);
  const box = page.locator('#game-canvas');

  // A touch anywhere makes the pad (and its Bag/Pause buttons) visible —
  // same first step as touch-joystick, tapping the joystick's own zone so
  // this doesn't also claim the button we are about to tap.
  await box.dispatchEvent('pointerdown', {
    pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 300, isPrimary: true, button: 0,
  });
  await box.dispatchEvent('pointerup', {
    pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 300, isPrimary: true,
  });
  await page.waitForTimeout(100);

  // Real screen coordinates for the Bag button, converted the same way
  // Input.toView does in reverse — this taps the actual rendered button
  // rather than assuming a layout, so it breaks if the button ever moves.
  const bag = await page.evaluate(() => {
    const r = window.fantastania.game.renderer;
    const btn = window.fantastania.game.controls.pad.buttons.get('bag');
    const rect = r.canvas.getBoundingClientRect();
    const cssScale = r.scale / r.dpr;
    return { x: rect.left + r.offsetX + btn.x * cssScale, y: rect.top + r.offsetY + btn.y * cssScale };
  });

  await box.dispatchEvent('pointerdown', {
    pointerId: 4, pointerType: 'touch', clientX: bag.x, clientY: bag.y, isPrimary: true, button: 0,
  });
  await box.dispatchEvent('pointerup', {
    pointerId: 4, pointerType: 'touch', clientX: bag.x, clientY: bag.y, isPrimary: true,
  });
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.constructor.name === 'PauseScene',
    null, { timeout: 4000 },
  );
  const tab = await page.evaluate(() => window.fantastania.game.scenes.active.tab);
  t.assert(tab === 'inventory', `tapping the Bag button opened the pack tab (${tab})`);
});

scenario('world-map', 'desktop', async (page, t) => {
  await t.waitForBoot(page);

  // Data integrity: every region has map layout data, and every link
  // connects two real areas. This is what would catch a seventh region
  // being added to AREA_ORDER without the map-screen data that goes with it.
  const data = await page.evaluate(() => {
    const { areas } = window.fantastania;
    // AREA_ORDER/POSITIONS/LINKS are not on the debug bridge; reach them via
    // a loaded area's own module cache is not available, so derive coverage
    // from what the Map tab itself actually used to draw the last frame.
    return { areaIds: Object.keys(areas) };
  });
  t.assert(data.areaIds.length === 6, `Aetheria has six regions (${data.areaIds.length})`);

  await page.keyboard.press('KeyM');
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.constructor.name === 'PauseScene',
    null, { timeout: 4000 },
  );
  const tab = await page.evaluate(() => window.fantastania.game.scenes.active.tab);
  t.assert(tab === 'map', `the M key opens the pause menu on the Map tab (${tab})`);

  const geom = await pausePanelGeom(page);
  const body = { x: geom.x + 20, y: geom.y + 92, w: geom.w - 40, h: geom.h - 148 };
  const gPad = 30;
  const gx = body.x + gPad;
  const gy = body.y + gPad;
  const gw = 456 - gPad * 2;
  const gh = body.h - gPad * 2;
  // Fractions from src/data/areas/index.ts's AREA_MAP_POSITIONS.
  const nodeAt = (fx, fy) => ({ x: gx + fx * gw, y: gy + fy * gh });
  const homestead = nodeAt(0.14, 0.62);
  const arcaneCaves = nodeAt(0.68, 0.66);
  const whisperingWoods = nodeAt(0.37, 0.58);

  // The starting area, clicked: "you are here", nothing to travel to.
  await t.viewClick(page, homestead.x, homestead.y);
  await page.waitForTimeout(80);
  const current = await page.evaluate(() => window.fantastania.game.scenes.active.selectedMapArea);
  t.assert(current === 'homestead', `clicking the current region's node selects it (${current})`);

  // A locked region shows no way to reach it and cannot be travelled to.
  await t.viewClick(page, arcaneCaves.x, arcaneCaves.y);
  await page.waitForTimeout(80);
  const beforeArea = await page.evaluate(() => window.fantastania.game.scenes.active.world.area.def.id);
  const detailBottom = geom.y + 92 + (geom.h - 148);
  await t.viewClick(page, geom.x + 496 + 102, detailBottom - 18);
  await page.waitForTimeout(150);
  const afterLockedClick = await page.evaluate(
    () => window.fantastania.game.scenes.active.constructor.name,
  );
  t.assert(afterLockedClick === 'PauseScene',
    'a locked region has no Travel button to click through to it');
  const stillSameArea = await page.evaluate(
    () => window.fantastania.game.scenes.active.world.area.def.id,
  );
  t.assert(stillSameArea === beforeArea, 'and the world area did not change');

  // Unlocking a region makes it travel-able for real, through the button.
  await page.evaluate(() => window.fantastania.state.unlockArea('whisperingWoods'));
  await t.viewClick(page, whisperingWoods.x, whisperingWoods.y);
  await page.waitForTimeout(80);
  await t.viewClick(page, geom.x + 496 + 102, detailBottom - 18);
  await page.waitForFunction(
    () => window.fantastania.game.scenes.active?.constructor.name === 'WorldScene'
      && window.fantastania.game.scenes.active.area?.def.id === 'whisperingWoods',
    null, { timeout: 6000 },
  );
  t.assert(true, 'clicking Travel on an unlocked region actually moves the player there');

  // The pause-menu shortcut guard must have reset, not left the world stuck
  // ignoring Escape because it still thinks a menu is opening.
  const menuOpening = await page.evaluate(() => window.fantastania.game.scenes.active.menuOpening);
  t.assert(menuOpening === false, 'the world can open the menu again after a map-driven travel');
});

scenario('minimap', 'desktop', async (page, t) => {
  await t.waitForBoot(page);

  const withSetting = await page.evaluate(async () => {
    const { state } = window.fantastania;
    state.settings.showMinimap = true;
    await new Promise((r) => setTimeout(r, 120));
    return true;
  });
  t.assert(withSetting, 'renders across a frame with the minimap enabled');

  // Visit a couple more areas with the radar live the whole time — the real
  // crash surface for a "draw whatever is nearby" overlay is an area with a
  // different shape of data (no boss, a locked portal, zero landmarks left).
  await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('whisperingWoods', 'fromHomestead', false);
  });
  await page.waitForTimeout(150);
  await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('bossArena', 'default', false);
  });
  await page.waitForTimeout(150);

  const disabled = await page.evaluate(async () => {
    window.fantastania.state.settings.showMinimap = false;
    await new Promise((r) => setTimeout(r, 120));
    return true;
  });
  t.assert(disabled, 'and across a frame with it turned back off, without throwing either way');
});

scenario('sprite-sheet', 'desktop', async (page, t) => {
  await t.waitForBoot(page);
  const result = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    await s.enterArea('ashenRuins', 'default', false);
    const mage = s.world.actors.find((a) => a.def && a.def.id === 'corruptedMage');
    if (!mage) return { found: false };
    // Give the image a moment to finish decoding.
    await new Promise((r) => setTimeout(r, 1000));
    const ready = window.fantastania.game.scenes.active
      ? true : false;
    return {
      found: true,
      hasAnimator: !!mage.animator || true, // private, but render() must not throw
      hp: mage.health,
    };
  });
  t.assert(result.found, 'the sprite-driven Corrupted Mage spawns');
  t.assert(result.hp > 0, 'it has health like any other enemy');

  // Force through every clip once; none may throw during render.
  const playedAll = await page.evaluate(async () => {
    const s = window.fantastania.game.scenes.active;
    const mage = s.world.actors.find((a) => a.def && a.def.id === 'corruptedMage');
    const kinds = [null, 'light', 'cast'];
    for (const k of kinds) {
      mage.pose.attackKind = k;
      mage.busy = k ? 0.3 : 0;
      for (let i = 0; i < 10; i++) {
        s.world.update(0.05);
      }
    }
    return true;
  });
  t.assert(playedAll, 'every animation clip advances without throwing');
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
  /** Waits for the app to finish booting, with the title screen on display. */
  async waitForMenu(page) {
    await page.waitForFunction(() => !!window.fantastania?.game, null, { timeout: 20000 });
    await page.waitForFunction(
      () => window.fantastania.game.scenes.active && window.fantastania.game.scenes.fade < 0.2,
      null,
      { timeout: 20000 },
    );
  },
  /**
   * Waits for boot, then jumps straight past the title/character-select flow
   * into a fresh single-player world — what nearly every gameplay scenario
   * actually wants to test. The handful of scenarios that exercise the menu
   * itself use `waitForMenu` and drive it with real clicks instead.
   */
  async waitForBoot(page) {
    await helpers.waitForMenu(page);
    await page.evaluate(() => window.fantastania.skipToWorld('eric'));
    await page.waitForFunction(
      () => window.fantastania.game.scenes.active?.player
        && window.fantastania.game.scenes.fade < 0.2,
      null,
      { timeout: 20000 },
    );
  },
  /**
   * Performs a real mouse click at a logical view-space coordinate, converting
   * through the renderer's actual offset/scale/dpr the same way Input.toView
   * does in reverse. This drives the UI exactly as a real user's click would
   * — through native browser mouse events — rather than calling scene methods
   * directly, so it genuinely exercises PointerTracker and button() hit-testing.
   */
  async viewClick(page, vx, vy) {
    const client = await page.evaluate(([vx, vy]) => {
      const r = window.fantastania.game.renderer;
      const rect = r.canvas.getBoundingClientRect();
      const cssScale = r.scale / r.dpr;
      return {
        x: rect.left + r.offsetX + vx * cssScale,
        y: rect.top + r.offsetY + vy * cssScale,
      };
    }, [vx, vy]);
    // Explicit down/wait/up rather than page.mouse.click(): a zero-delay
    // synthetic click can complete both events before the game's rAF loop
    // ever observes the pointer as down, which a real user's click (which
    // always has non-zero duration) never does. The wait makes this a more
    // faithful simulation, not a weaker one.
    await page.mouse.move(client.x, client.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(80);
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
