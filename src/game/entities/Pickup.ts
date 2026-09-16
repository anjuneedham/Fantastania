import { RARITY_COLORS, C, alpha, bodyFont } from '../../art/palette';
import { roundRect, starPath } from '../../art/sprites';
import { TAU, clamp01, dist2 } from '../../engine/math';
import { fx } from '../../engine/Rng';
import { getItem } from '../../data/items';
import { bus } from '../events';
import { state } from '../GameState';
import { addItem } from '../systems/InventorySystem';
import type { Rarity } from '../types';
import { Entity, type WorldLike } from './Entity';

/**
 * A dropped item or coin pile.
 *
 * Pickups arc out of a kill, settle, then home in on the player once they walk
 * close — automatic collection, because asking a phone player to tap tiny
 * objects on the floor after every fight is a bad time.
 */
export class Pickup extends Entity {
  override solid = false;

  itemId: string | null = null;
  count = 1;
  gold = 0;
  rarity: Rarity = 'common';

  /** Height above the ground, for the toss arc. */
  private z = 0;
  private vz = 0;
  private age = 0;
  /** Seconds before it can be collected; stops instant pickup mid-swing. */
  private armDelay = 0.45;
  private homing = false;
  /** Lifetime in seconds; drops eventually clean themselves up. */
  private ttl = 90;

  static forItem(itemId: string, count: number, x: number, y: number): Pickup {
    const p = new Pickup();
    const def = getItem(itemId);
    p.itemId = itemId;
    p.count = count;
    p.rarity = def.rarity;
    p.radius = 10;
    p.placeAt(x, y);
    return p;
  }

  static forGold(amount: number, x: number, y: number): Pickup {
    const p = new Pickup();
    p.gold = amount;
    p.rarity = 'common';
    p.radius = 9;
    p.placeAt(x, y);
    return p;
  }

  private placeAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    // Toss outward so a pile of drops fans out instead of stacking.
    const a = fx.angle();
    const speed = fx.range(40, 110);
    this.vx = Math.cos(a) * speed;
    this.vy = Math.sin(a) * speed * 0.6;
    this.vz = fx.range(90, 150);
  }

  update(dt: number, world: WorldLike): void {
    this.age += dt;
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.expired = true;
      return;
    }

    if (this.z > 0 || this.vz > 0) {
      this.vz -= 420 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        // A small bounce reads as weight without a physics engine.
        if (Math.abs(this.vx) + Math.abs(this.vy) > 20) {
          this.vx *= 0.4;
          this.vy *= 0.4;
        }
      }
      const drag = Math.exp(-3 * dt);
      this.vx *= drag;
      this.vy *= drag;
      world.moveWithCollision(this, this.vx * dt, this.vy * dt);
    }

    if (this.age < this.armDelay) return;

    const player = world.nearestActor(this.x, this.y, 'player', 140);
    if (!player || player.isDead) return;

    const d2 = dist2(this.x, this.y, player.x, player.y);
    // Magnet radius: generous enough that walking past collects it.
    if (!this.homing && d2 < 92 * 92) this.homing = true;

    if (this.homing) {
      const d = Math.max(1, Math.sqrt(d2));
      const pull = 260 + (1 - clamp01(d / 92)) * 420;
      this.x += ((player.x - this.x) / d) * pull * dt;
      this.y += ((player.y - this.y) / d) * pull * dt;
      if (d < player.radius + 12) this.collect(world);
    }
  }

  private collect(world: WorldLike): void {
    this.expired = true;
    if (this.gold > 0) {
      state.addGold(this.gold);
      bus.emit('goldPickedUp', { amount: this.gold });
      world.sfx('pickup_gold', this.x, this.y);
      world.emitParticles('spark', this.x, this.y, 5, C.gold, {
        speed: 70, size: 2.4, life: 0.35,
      });
      return;
    }
    if (!this.itemId) return;
    // The pickup carries its own count into the add. An earlier version passed
    // the count out-of-band through a map keyed by item id, which silently
    // collapsed two simultaneous drops of the same item into one.
    addItem(this.itemId, this.count);
    world.sfx('pickup_item', this.x, this.y);
    world.emitParticles('spark', this.x, this.y, 6, RARITY_COLORS[this.rarity], {
      speed: 80, size: 2.6, life: 0.4,
    });
  }

  /** Called by the scene after the inventory add succeeds. */
  get pickupLabel(): string {
    if (this.gold > 0) return `${this.gold}g`;
    const def = getItem(this.itemId as string);
    return this.count > 1 ? `${def.name} ×${this.count}` : def.name;
  }

  override get depth(): number {
    return this.y;
  }

  render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void {
    const color = this.gold > 0 ? C.gold : RARITY_COLORS[this.rarity];
    const bob = Math.sin(this.age * 3.4) * 2.5;
    const y = this.y - this.z - bob - 8;
    const notable = this.rarity === 'epic' || this.rarity === 'legendary';

    // Ground shadow anchors the item even while it is in the air.
    ctx.fillStyle = alpha(C.void, 0.3 * clamp01(1 - this.z / 90));
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 7, 3.2, 0, 0, TAU);
    ctx.fill();

    // Rare drops get a beam so they read from across a clearing.
    if (notable && quality === 'high') {
      const beam = ctx.createLinearGradient(this.x, this.y - 120, this.x, this.y);
      beam.addColorStop(0, alpha(color, 0));
      beam.addColorStop(1, alpha(color, 0.3));
      ctx.fillStyle = beam;
      ctx.fillRect(this.x - 7, this.y - 120, 14, 120);
    }

    if (quality === 'high') {
      const grad = ctx.createRadialGradient(this.x, y, 0, this.x, y, 22);
      grad.addColorStop(0, alpha(color, 0.5));
      grad.addColorStop(1, alpha(color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, y, 22, 0, TAU);
      ctx.fill();
    }

    if (this.gold > 0) {
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.ellipse(this.x, y, 6, 4.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = alpha(C.emberHot, 0.9);
      ctx.beginPath();
      ctx.ellipse(this.x - 1.4, y - 1.2, 2.4, 1.8, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      starPath(ctx, this.x, y, 8, 3.4, 4, this.age * 1.6);
      ctx.fill();
      ctx.fillStyle = alpha(C.white, 0.8);
      ctx.beginPath();
      ctx.arc(this.x, y, 2.2, 0, TAU);
      ctx.fill();
    }
  }

  /** Name tag, shown for anything above common so good drops are not missed. */
  override renderOverlay(ctx: CanvasRenderingContext2D): void {
    if (this.gold > 0 || this.rarity === 'common' || !this.itemId) return;
    const def = getItem(this.itemId);
    const color = RARITY_COLORS[this.rarity];
    const y = this.y - 34;

    ctx.font = bodyFont(11, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = this.count > 1 ? `${def.name} ×${this.count}` : def.name;
    const w = ctx.measureText(label).width + 16;

    ctx.fillStyle = alpha(C.void, 0.7);
    roundRect(ctx, this.x - w / 2, y - 9, w, 18, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, this.x, y);
  }
}
