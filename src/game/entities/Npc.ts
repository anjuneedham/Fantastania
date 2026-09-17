import { C, alpha, displayFont } from '../../art/palette';
import { createPose, drawActor, type ActorPose } from '../../art/sprites';
import { TAU, clamp01, damp } from '../../engine/math';
import { fx } from '../../engine/Rng';
import { getNpc, type NpcDef } from '../../data/npcs';
import { QUESTS } from '../../data/quests';
import type { NpcPlacement } from '../areaTypes';
import type { WorldLike } from './Entity';
import { Interactable } from './Interactable';
import type { Player } from './Player';
import { quests } from '../systems/QuestSystem';
import { state } from '../GameState';

/**
 * A non-combat character.
 *
 * Deliberately not an Actor: NPCs have no health, no faction combat role and no
 * status effects, and giving them those would mean every combat query has to
 * filter them out. They borrow the actor *renderer* and nothing else.
 */
export class Npc extends Interactable {
  override solid = true;
  readonly def: NpcDef;
  readonly pose: ActorPose = createPose();

  private homeX: number;
  private homeY: number;
  private wanderRadius: number;
  private targetX: number;
  private targetY: number;
  private idleTimer = 0;
  private facingHome: number;

  constructor(placement: NpcPlacement) {
    super();
    this.def = getNpc(placement.npcId);
    this.x = placement.x;
    this.y = placement.y;
    this.homeX = placement.x;
    this.homeY = placement.y;
    this.targetX = placement.x;
    this.targetY = placement.y;
    this.radius = 13;
    this.interactRadius = 58;
    this.wanderRadius = this.def.wanderRadius ?? 0;
    this.facingHome = placement.facing ?? Math.PI / 2;
    this.pose.facing = this.facingHome;
    if (this.def.interactRadius) this.interactRadius = this.def.interactRadius;
  }

  override get prompt(): string {
    return 'Talk';
  }

  override get title(): string {
    return this.def.name;
  }

  /** True when this NPC has a quest to offer or one waiting to be turned in. */
  get questMarker(): 'offer' | 'ready' | 'active' | null {
    if (quests.availableFrom(this.def.id).length > 0) return 'offer';
    for (const progress of state.activeQuests) {
      const turnInTo = questTurnInTarget(progress.questId);
      if (turnInTo !== this.def.id) continue;
      if (progress.readyToTurnIn) return 'ready';
      return 'active';
    }
    return null;
  }

  update(dt: number, world: WorldLike): void {
    this.pose.animTime += dt;
    this.trackProximity(world);

    // Face the player when they are close enough to talk.
    if (this.proximity > 0.2) {
      const player = world.nearestActor(this.x, this.y, 'player', 400);
      if (player) {
        const want = Math.atan2(player.y - this.y, player.x - this.x);
        this.pose.facing = damp(this.pose.facing, nearestAngle(this.pose.facing, want), 6, dt);
        this.pose.moveSpeed01 = 0;
        return;
      }
    }

    if (this.wanderRadius <= 0) {
      this.pose.facing = damp(this.pose.facing, nearestAngle(this.pose.facing, this.facingHome), 3, dt);
      this.pose.moveSpeed01 = 0;
      return;
    }

    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.idleTimer = fx.range(2.5, 6);
      const a = fx.angle();
      const d = fx.next() * this.wanderRadius;
      this.targetX = this.homeX + Math.cos(a) * d;
      this.targetY = this.homeY + Math.sin(a) * d;
    }

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6) {
      const speed = 42;
      world.moveWithCollision(this, (dx / dist) * speed * dt, (dy / dist) * speed * dt);
      this.pose.facing = Math.atan2(dy, dx);
      this.pose.moveSpeed01 = 0.4;
    } else {
      this.pose.moveSpeed01 = 0;
    }
  }

  interact(_world: WorldLike, _player: Player): boolean {
    // The scene owns the conversation UI, so it handles the actual start; this
    // returning true is what tells it to open one.
    return true;
  }

  render(ctx: CanvasRenderingContext2D, quality: 'high' | 'low'): void {
    drawActor(ctx, this.def.sprite, this.pose, this.x, this.y, quality);
  }

  override renderOverlay(ctx: CanvasRenderingContext2D): void {
    this.renderQuestMarker(ctx);
    this.renderPrompt(ctx, this.def.sprite.height + 28);
  }

  /** The floating marker that tells the player this NPC is worth visiting. */
  private renderQuestMarker(ctx: CanvasRenderingContext2D): void {
    const marker = this.questMarker;
    if (!marker) return;

    const bob = Math.sin(this.pose.animTime * 2.4) * 3;
    const y = this.y - this.def.sprite.height - 20 + bob;
    const color = marker === 'ready' ? C.gold : marker === 'offer' ? C.gold : C.haze;
    const glyph = marker === 'ready' ? '?' : marker === 'offer' ? '!' : '…';

    ctx.save();
    // Glow behind the glyph so it reads against any background.
    const grad = ctx.createRadialGradient(this.x, y, 0, this.x, y, 16);
    grad.addColorStop(0, alpha(color, 0.45));
    grad.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, y, 16, 0, TAU);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = displayFont(20);
    ctx.lineWidth = 3;
    ctx.strokeStyle = alpha(C.void, 0.8);
    ctx.strokeText(glyph, this.x, y);
    ctx.fillStyle = color;
    ctx.fillText(glyph, this.x, y);
    ctx.restore();
  }

  /** Used by the scene to fade the prompt with distance. */
  get promptStrength(): number {
    return clamp01(this.proximity);
  }
}

/** Picks the equivalent angle nearest the current one, to avoid a spin. */
function nearestAngle(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return from + delta;
}

/** Which NPC a quest is turned in to; undefined for an unknown quest id. */
function questTurnInTarget(questId: string): string | undefined {
  const def = QUESTS[questId];
  return def ? def.turnInTo ?? def.giver : undefined;
}
