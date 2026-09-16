import { C, RARITY_COLORS, alpha } from '../../art/palette';
import { TAU } from '../../engine/math';
import { Rng } from '../../engine/Rng';
import type { ChestPlacement } from '../areaTypes';
import { bus } from '../events';
import { state } from '../GameState';
import { rollLoot } from '../systems/InventorySystem';
import { checkRequirement } from '../systems/AreaManager';
import { Interactable } from './Interactable';
import { Pickup } from './Pickup';
import type { WorldLike } from './Entity';
import type { Player } from './Player';

/**
 * A lootable container.
 *
 * Contents are rolled from a seeded generator keyed on the chest's id, so the
 * same chest gives the same loot no matter when it is opened — which means a
 * player cannot reload to reroll a legendary, and a walkthrough stays true.
 */
export class Chest extends Interactable {
  override solid = true;
  readonly def: ChestPlacement;
  opened: boolean;

  private lidAngle = 0;
  private glowT = 0;

  constructor(def: ChestPlacement) {
    super();
    this.def = def;
    this.x = def.x;
    this.y = def.y;
    this.radius = 16;
    this.interactRadius = 52;
    this.opened = state.openedChests.includes(def.id);
    if (this.opened) this.lidAngle = 1;
  }

  override get prompt(): string {
    if (this.opened) return 'Empty';
    const gate = checkRequirement(this.def.requires);
    return gate.ok ? 'Open' : 'Locked';
  }

  override get title(): string {
    return this.opened ? 'Opened Chest' : 'Chest';
  }

  override get available(): boolean {
    return !this.opened;
  }

  update(dt: number, world: WorldLike): void {
    this.glowT += dt;
    this.trackProximity(world);
    if (this.opened && this.lidAngle < 1) this.lidAngle = Math.min(1, this.lidAngle + dt * 4);
  }

  interact(world: WorldLike, _player: Player): boolean {
    if (this.opened) return false;

    const gate = checkRequirement(this.def.requires);
    if (!gate.ok) {
      bus.emit('toast', { text: gate.reason ?? 'It will not open.', color: C.blood, icon: '🔒' });
      world.sfx('ui_error', this.x, this.y);
      return false;
    }

    this.opened = true;
    state.openedChests.push(this.def.id);
    bus.emit('chestOpened', { chestId: this.def.id });
    world.sfx('chest_open', this.x, this.y);
    world.emitParticles('rune', this.x, this.y - 14, 16, C.gold, {
      speed: 130, size: 4, life: 0.9, rise: 60,
    });

    // Seeded on the chest id: the same chest always holds the same thing.
    const rng = new Rng(hashString(this.def.id));
    const loot = rollLoot(this.def.lootTableId, rng);

    if (loot.gold > 0) world.spawn(Pickup.forGold(loot.gold, this.x, this.y - 6));
    for (const item of loot.items) {
      world.spawn(Pickup.forItem(item.itemId, item.count, this.x, this.y - 6));
    }
    return true;
  }

  render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void {
    const w = 30;
    const h = 20;
    const x = this.x;
    const y = this.y;

    ctx.fillStyle = alpha(C.void, 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.6, h * 0.28, 0, 0, TAU);
    ctx.fill();

    if (!this.opened && this.def.landmark && quality === 'high') {
      // Landmark chests get a light column, so they read from across an area.
      const pulse = 0.6 + Math.sin(this.glowT * 2) * 0.2;
      const beam = ctx.createLinearGradient(x, y - 170, x, y);
      beam.addColorStop(0, alpha(C.gold, 0));
      beam.addColorStop(1, alpha(C.gold, 0.22 * pulse));
      ctx.fillStyle = beam;
      ctx.fillRect(x - 11, y - 170, 22, 170);
    }

    // Body.
    ctx.fillStyle = '#5c4630';
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = '#3b2a1c';
    ctx.fillRect(x - w / 2, y - 5, w, 5);
    // Iron bands.
    ctx.fillStyle = '#6b6575';
    ctx.fillRect(x - w / 2, y - h * 0.62, w, 3.4);
    ctx.fillRect(x - 3, y - h, 6, h);

    // Lid, hinged at the back and opening away from the viewer.
    ctx.save();
    ctx.translate(x, y - h);
    ctx.rotate(-this.lidAngle * 1.1);
    ctx.fillStyle = '#6b5136';
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(w / 2, -9);
    ctx.quadraticCurveTo(0, -15, -w / 2, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b6575';
    ctx.fillRect(-3, -13, 6, 13);
    ctx.restore();

    if (!this.opened) {
      // Lock plate, tinted by whether it can be opened right now.
      const gate = checkRequirement(this.def.requires);
      ctx.fillStyle = gate.ok ? C.gold : C.blood;
      ctx.beginPath();
      ctx.arc(x, y - h * 0.55, 3.4, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = alpha(C.void, 0.55);
      ctx.fillRect(x - w / 2 + 3, y - h + 2, w - 6, h - 6);
    }
  }

  override renderOverlay(ctx: CanvasRenderingContext2D): void {
    this.renderPrompt(ctx, 44);
  }
}

/** Stable string hash, so chest seeds survive a reload. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Rarity tint used by the loot beam; exported for the minimap legend. */
export const CHEST_BEAM_COLORS = RARITY_COLORS;
