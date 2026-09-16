import { C, alpha, bodyFont } from '../art/palette';
import type { Renderer } from '../engine/Renderer';
import { Scene } from '../engine/Scene';
import { dist2 } from '../engine/math';
import { state } from '../game/GameState';
import { bus } from '../game/events';
import { Player } from '../game/entities/Player';
import type { Portal } from '../game/entities/Portal';
import { checkRequirement, loadArea, spawnPointFor, type LoadedArea } from '../game/systems/AreaManager';
import { World } from '../game/World';
import { WorldRenderer } from '../game/WorldRenderer';
import { renderPad } from '../ui/padRenderer';
import { toasts } from '../ui/toasts';

/**
 * The gameplay scene: owns the World, drives the player, and handles area
 * transitions, landmark discovery and secrets.
 *
 * Everything area-specific comes from the AreaDef, so this file never mentions
 * the Woods or the Ruins by name.
 */
/**
 * Camera zoom for gameplay. Tuned so a character is roughly a tenth of the
 * screen height on a phone — big enough to read their facing and animation,
 * small enough to see an enemy coming.
 */
const WORLD_ZOOM = 1.25;

export class WorldScene extends Scene {
  world!: World;
  renderer = new WorldRenderer();
  player!: Player;
  area!: LoadedArea;

  /** Blocks portal re-entry immediately after arriving. */
  private portalGrace = 0;
  /** Seconds the player has been standing in a portal. */
  private portalDwell = 0;
  private dwellingPortal: Portal | null = null;
  private transitioning = false;

  override async enter(): Promise<void> {
    const { game } = this;
    this.world = new World({ audio: game.audio, camera: game.camera });
    this.player = new Player(state.characterId);
    toasts.attach();

    await this.enterArea(state.currentAreaId, state.spawnPointId, false);
    game.controls.pad.setVisible('block', this.player.def.canBlock);
    game.scenes.fadeIn(0.6);
  }

  override exit(): void {
    toasts.detach();
  }

  /** Loads an area and places the player at one of its spawn points. */
  async enterArea(areaId: string, spawnId: string, fade = true): Promise<void> {
    const { game } = this;
    if (fade) {
      this.transitioning = true;
      await game.scenes.fadeOut(0.3);
    }

    this.area = loadArea(this.world, areaId);
    this.renderer.setArea(this.area.def);

    const spawn = spawnPointFor(this.area.def, spawnId);
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.pose.facing = spawn.facing;
    this.player.vx = 0;
    this.player.vy = 0;
    this.world.addNow(this.player);

    state.currentAreaId = areaId;
    state.spawnPointId = spawnId;
    state.unlockArea(areaId);

    game.camera.bounds = this.world.bounds;
    game.camera.zoom = WORLD_ZOOM;
    game.camera.snapTo(this.player.x, this.player.y);
    game.camera.clampToBounds(game.renderer.viewWidth, game.renderer.viewHeight);

    game.audio.playMusic(this.area.def.music);
    bus.emit('areaEntered', { areaId });

    this.portalGrace = 0.9;
    this.portalDwell = 0;
    this.dwellingPortal = null;

    // Announce the area unless the player has been here before.
    if (!state.discoveredLocations.includes(`area:${areaId}`)) {
      state.discoveredLocations.push(`area:${areaId}`);
      toasts.showTitle(this.area.def.name, this.area.def.subtitle);
    }

    if (fade) {
      game.scenes.fadeIn(0.45);
      this.transitioning = false;
    }
  }

  override update(dt: number): void {
    if (this.transitioning) return;
    const { game } = this;
    const controls = game.controls;

    if (controls.pressed('dodge')) {
      if (this.player.startDodge(controls.moveX, controls.moveY)) {
        this.world.sfx('dodge');
        this.world.emitParticles('dust', this.player.x, this.player.y, 9, C.haze, {
          speed: 80, size: 3.2, life: 0.45,
        });
      }
    }

    this.player.applyInput(controls, dt, this.world);
    this.world.update(dt);
    this.renderer.update(dt, this.world, game.camera, game.renderer);
    toasts.update(dt);

    this.updatePortals(dt);
    this.checkDiscoveries();

    game.camera.follow(this.player.x, this.player.y - 24, dt);
    game.camera.clampToBounds(game.renderer.viewWidth, game.renderer.viewHeight);
  }

  /**
   * Portals fire after a short dwell rather than on contact, so a player
   * skirting a doorway in a fight is not yanked out of the area.
   */
  private updatePortals(dt: number): void {
    this.portalGrace = Math.max(0, this.portalGrace - dt);

    let inside: Portal | null = null;
    for (const portal of this.area.portals) {
      const gate = checkRequirement(portal.def.requires);
      portal.unlocked = gate.ok;
      if (portal.contains(this.player.x, this.player.y)) inside = portal;
    }

    if (!inside) {
      this.dwellingPortal = null;
      this.portalDwell = 0;
      return;
    }
    if (this.portalGrace > 0) return;

    if (this.dwellingPortal !== inside) {
      this.dwellingPortal = inside;
      this.portalDwell = 0;
      const gate = checkRequirement(inside.def.requires);
      if (!gate.ok) {
        bus.emit('toast', { text: gate.reason ?? 'The way is closed.', color: C.blood, icon: '🔒' });
        this.world.sfx('ui_error');
        // Block re-nagging until the player steps out and back in.
        this.portalGrace = 1.2;
      }
      return;
    }

    if (!inside.unlocked) return;
    this.portalDwell += dt;
    if (this.portalDwell >= 0.35) {
      this.world.sfx('door');
      void this.enterArea(inside.def.toArea, inside.def.toSpawn);
    }
  }

  /** Landmarks announce themselves; secrets pay out once. */
  private checkDiscoveries(): void {
    const px = this.player.x;
    const py = this.player.y;

    for (let i = this.area.landmarks.length - 1; i >= 0; i--) {
      const lm = this.area.landmarks[i];
      if (dist2(px, py, lm.x, lm.y) > lm.radius * lm.radius) continue;
      this.area.landmarks.splice(i, 1);
      state.discoveredLocations.push(lm.id);
      bus.emit('locationDiscovered', { locationId: lm.id, areaId: this.area.def.id });
      if (lm.message) {
        toasts.showTitle(lm.name, lm.message, 4.4);
      } else {
        bus.emit('toast', { text: `Discovered: ${lm.name}`, color: C.aether, icon: '🧭' });
      }
    }

    for (let i = this.area.secrets.length - 1; i >= 0; i--) {
      const secret = this.area.secrets[i];
      if (dist2(px, py, secret.x, secret.y) > secret.radius * secret.radius) continue;
      this.area.secrets.splice(i, 1);
      state.foundSecrets.push(secret.id);
      bus.emit('secretFound', { secretId: secret.id, areaId: this.area.def.id });

      this.world.sfx('secret_found');
      this.world.emitParticles('rune', px, py - 20, 18, C.aetherSoft, {
        speed: 120, size: 4, life: 1.2, rise: 40,
      });
      this.world.particles.ring(px, py, 90, C.aetherSoft, 0.8);
      toasts.showTitle(secret.name, secret.message, 5);

      const reward = secret.reward;
      if (reward) {
        if (reward.xp) state.addXp(reward.xp, 'secret');
        if (reward.gold) state.addGold(reward.gold);
        if (reward.itemId) {
          bus.emit('itemGained', {
            itemId: reward.itemId,
            count: reward.count ?? 1,
            rarity: 'common',
          });
        }
      }
    }
  }

  override render(r: Renderer): void {
    const ctx = r.ctx;
    const { camera } = this.game;

    ctx.save();
    r.clipToView();

    ctx.save();
    camera.apply(r);
    this.renderer.renderGround(ctx, camera, r);
    this.renderer.renderGlows(ctx, this.world, camera, r, this.game.realTime);
    this.world.render(ctx, r.quality, camera.visibleRect(r, 120));
    this.renderer.renderEmissive(ctx, this.world, camera, r, this.game.realTime);
    ctx.restore();

    this.renderer.renderLighting(ctx, r);
    toasts.render(ctx, r);
    this.renderDebug(ctx, r);
    ctx.restore();

    renderPad(ctx, this.game.controls.pad, r);
  }

  private renderDebug(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const { stats } = this.game;
    ctx.font = bodyFont(11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = alpha(C.haze, 0.7);
    ctx.fillText(
      `${stats.fps}fps ${stats.frameMs.toFixed(1)}ms · ${this.world.entities.length}e ` +
      `${this.world.props.length}p · ${this.area.def.id}`,
      r.safeLeft + 10,
      r.safeTop + 8,
    );
  }
}
