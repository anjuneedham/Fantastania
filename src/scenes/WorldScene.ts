import { C, alpha, bodyFont } from '../art/palette';
import { Scene } from '../engine/Scene';
import type { Renderer } from '../engine/Renderer';
import { Player } from '../game/entities/Player';
import { World } from '../game/World';
import { state } from '../game/GameState';
import { renderPad } from '../ui/padRenderer';

/**
 * The gameplay scene. Owns the World, drives the player's input and renders the
 * world through the camera.
 *
 * Phase 1 scope: a walkable test field that proves movement, collision, camera
 * follow and the touch controls. The area system replaces the hard-coded
 * geometry in Phase 2.
 */
export class WorldScene extends Scene {
  world!: World;
  player!: Player;

  override async enter(): Promise<void> {
    const { game } = this;
    this.world = new World({ audio: game.audio, camera: game.camera });
    this.world.bounds = { x: 0, y: 0, w: 2200, h: 1500 };

    // Temporary geometry so collision has something to resolve against.
    this.world.obstacles = [
      { kind: 'rect', x: 400, y: 300, w: 220, h: 60 },
      { kind: 'rect', x: 1200, y: 800, w: 80, h: 340 },
      { kind: 'circle', x: 900, y: 520, r: 70 },
      { kind: 'circle', x: 1600, y: 380, r: 48 },
    ];

    this.player = new Player(state.characterId);
    this.player.x = 300;
    this.player.y = 750;
    this.world.addNow(this.player);

    game.camera.bounds = this.world.bounds;
    game.camera.snapTo(this.player.x, this.player.y);
    game.camera.clampToBounds(game.renderer.viewWidth, game.renderer.viewHeight);

    game.controls.pad.setVisible('block', this.player.def.canBlock);
    game.audio.playMusic('theme_homestead');
    this.game.scenes.fadeIn(0.5);
  }

  override update(dt: number): void {
    const { game } = this;
    const controls = game.controls;

    if (controls.pressed('dodge')) {
      if (this.player.startDodge(controls.moveX, controls.moveY)) {
        this.world.sfx('dodge');
        this.world.emitParticles('dust', this.player.x, this.player.y, 8, C.haze, {
          speed: 70, size: 3, life: 0.4,
        });
      }
    }

    this.player.applyInput(controls, dt, this.world);
    this.world.update(dt);

    game.camera.follow(this.player.x, this.player.y - 20, dt);
    game.camera.clampToBounds(game.renderer.viewWidth, game.renderer.viewHeight);
  }

  override render(r: Renderer): void {
    const ctx = r.ctx;
    const { camera } = this.game;

    ctx.save();
    r.clipToView();
    this.renderGround(ctx, r);

    ctx.save();
    camera.apply(r);
    this.renderObstacles(ctx);
    this.world.render(ctx, r.quality);
    ctx.restore();

    this.renderDebug(ctx, r);
    ctx.restore();

    renderPad(ctx, this.game.controls.pad, r);
  }

  private renderGround(ctx: CanvasRenderingContext2D, r: Renderer): void {
    ctx.fillStyle = C.deepNight;
    ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);

    // A parallax grid, drawn in view space so only the visible cells are ever
    // touched regardless of how large the world is.
    const { camera } = this.game;
    const cell = 64;
    const offsetX = -((camera.x - r.viewWidth / 2) % cell);
    const offsetY = -((camera.y - r.viewHeight / 2) % cell);
    ctx.strokeStyle = alpha(C.slate, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX; x < r.viewWidth; x += cell) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, r.viewHeight);
    }
    for (let y = offsetY; y < r.viewHeight; y += cell) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(r.viewWidth, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  private renderObstacles(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = C.slate;
    ctx.strokeStyle = C.mist;
    ctx.lineWidth = 2;
    for (const ob of this.world.obstacles) {
      ctx.beginPath();
      if (ob.kind === 'rect') ctx.rect(ob.x, ob.y, ob.w, ob.h);
      else ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private renderDebug(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const { stats } = this.game;
    ctx.font = bodyFont(12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = alpha(C.haze, 0.85);
    ctx.fillText(
      `${stats.fps} fps  ${stats.frameMs.toFixed(1)}ms  ${this.world.entities.length} ent  ` +
      `${r.viewWidth}x${r.viewHeight}`,
      r.safeLeft + 10,
      r.safeTop + 8,
    );
  }
}
