import { getQuest } from '../data/quests';
import { tryGetItem } from '../data/items';
import { C, alpha, bodyFont, displayFont, RARITY_COLORS } from '../art/palette';
import { createPose, drawActor } from '../art/sprites';
import { clamp, TAU } from '../engine/math';
import type { Renderer } from '../engine/Renderer';
import { Scene } from '../engine/Scene';
import type { Player } from '../game/entities/Player';
import { state, type QuestProgress } from '../game/GameState';
import {
  equipItem, inventoryEntries, sellItem, sortInventory, unequipSlot, useItem,
} from '../game/systems/InventorySystem';
import { objectiveProgress, quests } from '../game/systems/QuestSystem';
import { activeTree, nodeStatus, respec, spendPoint } from '../game/systems/SkillSystem';
import type { EquipSlot, StatKey } from '../game/types';
import { STAT_LABELS } from '../game/types';
import { wrapText } from '../ui/dialogueView';
import {
  button, iconButton, panel, PointerTracker, sectionTitle, statBar, tabBar,
  type ButtonVariant, type Rect,
} from '../ui/widgets';
import { MainMenuScene } from './MainMenuScene';
import { SettingsScene } from './SettingsScene';
import type { WorldScene } from './WorldScene';

export type PauseTab = 'character' | 'inventory' | 'skills' | 'quests';

const TABS: readonly PauseTab[] = ['character', 'inventory', 'skills', 'quests'];
const TAB_LABELS = ['Character', 'Pack', 'Skills', 'Quests'];
const STAT_ORDER: readonly StatKey[] = ['strength', 'defense', 'magic', 'agility', 'vitality', 'spirit'];
const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Weapon', armor: 'Armor', accessory: 'Accessory',
};

/**
 * The in-game pause menu: character sheet, inventory, skill tree and quest
 * log, plus the doorway to Settings and the title screen.
 *
 * Pushed as a transparent overlay on WorldScene the same way SettingsScene
 * sits over MainMenuScene, which is what freezes gameplay for free — the
 * scene stack skips `update()` on a covered, non-`updateBelow` scene, so the
 * world simply stops simulating for as long as this is on top. `render()`
 * still walks down through a transparent scene, so the frozen world keeps
 * drawing, dimmed, behind the panel.
 */
export class PauseScene extends Scene {
  override readonly transparent = true;
  private pointer = new PointerTracker();
  private tab: PauseTab;

  private selectedItemId: string | null = null;
  private selectedSkill: string | null = null;
  private pendingQuit = false;
  private pendingRespec = false;
  private pendingAbandon: string | null = null;

  private invScroll = 0;
  private skillScroll = 0;
  private questScroll = 0;

  private flashMsg = '';
  private flashTime = 0;

  private readonly pose = createPose();

  constructor(private readonly world: WorldScene, initialTab: PauseTab = 'character') {
    super();
    this.tab = initialTab;
  }

  override async enter(): Promise<void> {
    sortInventory();
  }

  override suspend(): void {
    this.pointer.reset();
  }

  override resume(): void {
    this.pendingQuit = false;
  }

  override frameUpdate(dt: number): void {
    this.pointer.update(this.game.controls.input);
    this.pose.animTime += dt;
    this.pose.facing = -Math.PI / 2;
    if (this.flashTime > 0) this.flashTime = Math.max(0, this.flashTime - dt);

    const wheel = this.game.controls.input.wheelDelta;
    if (wheel !== 0) {
      if (this.tab === 'inventory') this.invScroll += wheel * 0.5;
      else if (this.tab === 'skills') this.skillScroll += wheel * 0.5;
      else if (this.tab === 'quests') this.questScroll += wheel * 0.5;
    }

    if (this.game.controls.pressedRaw('cancel')) this.close();
  }

  override onBack(): boolean {
    this.close();
    return true;
  }

  private close(): void {
    this.game.scenes.pop();
  }

  private flash(msg: string): void {
    this.flashMsg = msg;
    this.flashTime = 2.4;
  }

  /* ------------------------------------------------------------------ */

  override render(r: Renderer): void {
    const ctx = r.ctx;
    ctx.save();
    r.clipToView();
    ctx.fillStyle = alpha(C.void, 0.74);
    ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);

    const w = Math.min(720, r.viewWidth - 40);
    const h = Math.min(500, r.viewHeight - 40);
    const rect: Rect = { x: r.viewWidth / 2 - w / 2, y: r.viewHeight / 2 - h / 2, w, h };
    panel(ctx, rect, { alpha: 0.97 });

    sectionTitle(ctx, rect.x + 22, rect.y + 34, 'Paused');
    const closeRect: Rect = { x: rect.x + rect.w - 40, y: rect.y + 12, w: 28, h: 28 };
    if (iconButton(ctx, this.pointer, closeRect, '✕')) this.close();

    const tabRect: Rect = { x: rect.x + 20, y: rect.y + 46, w: rect.w - 40, h: 34 };
    const clicked = tabBar(ctx, this.pointer, tabRect, TAB_LABELS, TABS.indexOf(this.tab));
    if (clicked >= 0 && TABS[clicked] !== this.tab) {
      this.tab = TABS[clicked];
      if (this.tab === 'inventory') sortInventory();
    }

    const body: Rect = { x: rect.x + 20, y: rect.y + 92, w: rect.w - 40, h: rect.h - 148 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(body.x, body.y, body.w, body.h);
    ctx.clip();
    switch (this.tab) {
      case 'character': this.renderCharacter(ctx, body); break;
      case 'inventory': this.renderInventory(ctx, body); break;
      case 'skills': this.renderSkills(ctx, body); break;
      case 'quests': this.renderQuests(ctx, body); break;
    }
    ctx.restore();

    if (this.flashTime > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = bodyFont(11, 700);
      ctx.fillStyle = alpha(C.aetherSoft, Math.min(1, this.flashTime));
      ctx.fillText(this.flashMsg, rect.x + rect.w / 2, rect.y + rect.h - 50);
    }

    this.renderFooter(ctx, rect);
    ctx.restore();
  }

  private renderFooter(ctx: CanvasRenderingContext2D, rect: Rect): void {
    const y = rect.y + rect.h - 44;

    if (button(ctx, this.pointer, { x: rect.x + 20, y, w: 100, h: 32 }, 'Settings')) {
      this.game.scenes.push(new SettingsScene());
    }
    if (button(ctx, this.pointer, { x: rect.x + 130, y, w: 90, h: 32 }, 'Save')) {
      void this.world.autosave().then(() => this.flash('Game saved.'));
    }
    if (button(ctx, this.pointer, { x: rect.x + 310, y, w: 100, h: 32 }, 'Resume', { variant: 'primary' })) {
      this.close();
    }
    const quitLabel = this.pendingQuit ? 'Really quit?' : 'Quit to Title';
    if (button(ctx, this.pointer, { x: rect.x + 530, y, w: 170, h: 32 }, quitLabel,
      { variant: 'danger', fontSize: 12 })) {
      if (this.pendingQuit) void this.quitToTitle();
      else this.pendingQuit = true;
    }
  }

  private async quitToTitle(): Promise<void> {
    await this.world.autosave();
    this.game.controls.pad.releaseAll();
    this.game.controls.gameplayEnabled = false;
    this.game.scenes.replace(new MainMenuScene());
  }

  /* ------------------------------------------------------------------ */
  /* Character                                                          */
  /* ------------------------------------------------------------------ */

  private renderCharacter(ctx: CanvasRenderingContext2D, rect: Rect): void {
    const player = this.world.player;
    const def = player.def;
    const stats = player.stats;

    const stageCx = rect.x + 95;
    const stageCy = rect.y + 116;
    const scaleUp = 1.6;
    ctx.save();
    ctx.translate(stageCx, stageCy + def.sprite.height * scaleUp * 0.4);
    ctx.scale(scaleUp, scaleUp);
    drawActor(ctx, player.sprite, this.pose, 0, 0, 'high');
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = displayFont(16);
    ctx.fillStyle = def.themeColor;
    ctx.fillText(def.name, stageCx, rect.y + 190);
    ctx.font = bodyFont(11, 600);
    ctx.fillStyle = alpha(C.boneDim, 0.9);
    ctx.fillText(def.title, stageCx, rect.y + 206);

    const slots: EquipSlot[] = ['weapon', 'armor', 'accessory'];
    const slotSize = 54;
    const totalW = slots.length * slotSize + (slots.length - 1) * 8;
    let sx = stageCx - totalW / 2;
    const sy = rect.y + 224;
    for (const slot of slots) {
      this.renderEquipSlot(ctx, { x: sx, y: sy, w: slotSize, h: slotSize }, slot, player);
      sx += slotSize + 8;
    }

    const rx = rect.x + 210;
    const rw = rect.w - 210;
    let y = rect.y + 2;

    statBar(ctx, { x: rx, y, w: rw, h: 18 }, player.healthPct, C.blood,
      { label: `HP  ${Math.ceil(player.health)} / ${player.maxHealth}` });
    y += 26;
    if (player.maxMana > 0) {
      statBar(ctx, { x: rx, y, w: rw, h: 14 }, player.manaPct, C.aether,
        { label: `MP  ${Math.ceil(player.mana)} / ${player.maxMana}`, textColor: alpha(C.deepNight, 0.85) });
      y += 22;
    }
    const xpLabel = Number.isFinite(state.xpForNextLevel)
      ? `Level ${state.level} · ${state.xp} / ${state.xpForNextLevel} XP`
      : `Level ${state.level} · MAX`;
    statBar(ctx, { x: rx, y, w: rw, h: 12 }, state.xpProgress, C.gold, { label: xpLabel });
    y += 26;

    ctx.textAlign = 'left';
    ctx.font = bodyFont(12, 600);
    ctx.fillStyle = C.gold;
    ctx.fillText(
      `${state.gold}g · ${state.skillPoints} skill point${state.skillPoints === 1 ? '' : 's'} unspent`,
      rx, y + 10,
    );
    y += 30;

    sectionTitle(ctx, rx, y + 2, 'Attributes');
    y += 16;
    const colW = rw / 2;
    STAT_ORDER.forEach((key, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = rx + col * colW;
      const ly = y + row * 22;
      ctx.textAlign = 'left';
      ctx.font = bodyFont(12, 500);
      ctx.fillStyle = alpha(C.boneDim, 0.9);
      ctx.fillText(STAT_LABELS[key], lx, ly + 10);
      ctx.textAlign = 'right';
      ctx.font = bodyFont(12, 700);
      ctx.fillStyle = C.bone;
      ctx.fillText(String(Math.round(stats.total[key])), lx + colW - 10, ly + 10);
    });
  }

  private renderEquipSlot(
    ctx: CanvasRenderingContext2D, rect: Rect, slot: EquipSlot, player: Player,
  ): void {
    const itemId = state.equipment[slot];
    const def = itemId ? tryGetItem(itemId) : undefined;
    const hover = this.pointer.hovering(rect);

    ctx.fillStyle = alpha(C.duskBlue, hover ? 0.85 : 0.6);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.strokeStyle = def ? RARITY_COLORS[def.rarity] : alpha(C.mist, 0.55);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (def) {
      ctx.font = displayFont(20);
      ctx.fillStyle = C.bone;
      ctx.fillText(def.icon, rect.x + rect.w / 2, rect.y + rect.h / 2 - 5);
      ctx.font = bodyFont(8, 600);
      ctx.fillStyle = alpha(C.boneDim, 0.8);
      ctx.fillText(SLOT_LABELS[slot], rect.x + rect.w / 2, rect.y + rect.h - 7);
    } else {
      ctx.font = bodyFont(9, 600);
      ctx.fillStyle = alpha(C.boneDim, 0.55);
      ctx.fillText(SLOT_LABELS[slot], rect.x + rect.w / 2, rect.y + rect.h / 2);
    }

    if (def && this.pointer.clicked(rect)) {
      const res = unequipSlot(slot, player);
      if (!res.ok) this.flash(res.reason ?? 'Cannot unequip.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Inventory                                                          */
  /* ------------------------------------------------------------------ */

  private renderInventory(ctx: CanvasRenderingContext2D, rect: Rect): void {
    const entries = inventoryEntries();
    if (this.selectedItemId && !entries.some((e) => e.stack.itemId === this.selectedItemId)) {
      this.selectedItemId = null;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = bodyFont(11, 700);
    ctx.fillStyle = alpha(C.boneDim, 0.85);
    ctx.fillText(`Pack: ${entries.length} / 48`, rect.x, rect.y);

    const gridRect: Rect = { x: rect.x, y: rect.y + 18, w: 456, h: rect.h - 18 };
    const cell = 58;
    const gap = 6;
    const cols = Math.max(1, Math.floor((gridRect.w + gap) / (cell + gap)));
    const rows = Math.max(1, Math.ceil(entries.length / cols));
    const maxScroll = Math.max(0, rows * (cell + gap) - gridRect.h);
    this.invScroll = clamp(this.invScroll, 0, maxScroll);

    ctx.save();
    ctx.beginPath();
    ctx.rect(gridRect.x, gridRect.y, gridRect.w, gridRect.h);
    ctx.clip();
    entries.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridRect.x + col * (cell + gap);
      const cy = gridRect.y + row * (cell + gap) - this.invScroll;
      if (cy + cell < gridRect.y || cy > gridRect.y + gridRect.h) return;
      this.renderItemCell(ctx, { x: cx, y: cy, w: cell, h: cell }, entry);
    });
    ctx.restore();

    const detailRect: Rect = { x: rect.x + 476, y: rect.y, w: rect.w - 476, h: rect.h };
    this.renderItemDetail(ctx, detailRect, entries);
  }

  private renderItemCell(
    ctx: CanvasRenderingContext2D, rect: Rect,
    entry: ReturnType<typeof inventoryEntries>[number],
  ): void {
    const { def, stack } = entry;
    const selected = this.selectedItemId === stack.itemId;
    const equipped = def.slot && state.equipment[def.slot] === stack.itemId;

    ctx.fillStyle = selected ? alpha(RARITY_COLORS[def.rarity], 0.25) : alpha(C.duskBlue, 0.6);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.strokeStyle = selected ? RARITY_COLORS[def.rarity] : alpha(RARITY_COLORS[def.rarity], 0.5);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = displayFont(19);
    ctx.fillStyle = C.bone;
    ctx.fillText(def.icon, rect.x + rect.w / 2, rect.y + rect.h / 2 - 2);

    if (stack.count > 1) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = bodyFont(9, 700);
      ctx.fillStyle = alpha(C.bone, 0.9);
      ctx.fillText(`×${stack.count}`, rect.x + rect.w - 5, rect.y + rect.h - 5);
    }
    if (equipped) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = bodyFont(8, 700);
      ctx.fillStyle = C.aether;
      ctx.fillText('E', rect.x + 6, rect.y + 5);
    }

    if (this.pointer.clicked(rect)) this.selectedItemId = stack.itemId;
  }

  private renderItemDetail(
    ctx: CanvasRenderingContext2D, rect: Rect, entries: ReturnType<typeof inventoryEntries>,
  ): void {
    const entry = entries.find((e) => e.stack.itemId === this.selectedItemId);
    if (!entry) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = bodyFont(12, 500);
      ctx.fillStyle = alpha(C.boneDim, 0.6);
      ctx.fillText('Select an item.', rect.x, rect.y);
      return;
    }

    const { def, stack } = entry;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = displayFont(15);
    ctx.fillStyle = RARITY_COLORS[def.rarity];
    ctx.fillText(def.name, rect.x, rect.y + 15);

    ctx.font = bodyFont(10, 600);
    ctx.fillStyle = alpha(C.boneDim, 0.85);
    const kindLine = `${def.rarity.toUpperCase()} · ${def.kind}${stack.count > 1 ? ` ×${stack.count}` : ''}`;
    ctx.fillText(kindLine, rect.x, rect.y + 30);

    ctx.font = bodyFont(11, 500);
    ctx.fillStyle = alpha(C.bone, 0.9);
    let ly = rect.y + 50;
    for (const line of wrapText(ctx, def.description, rect.w).slice(0, 4)) {
      ctx.fillText(line, rect.x, ly);
      ly += 15;
    }

    if (def.stats) {
      ly += 6;
      ctx.font = bodyFont(10, 600);
      ctx.fillStyle = C.aetherSoft;
      for (const key of STAT_ORDER) {
        const v = def.stats[key];
        if (!v) continue;
        ctx.fillText(`+${v} ${STAT_LABELS[key]}`, rect.x, ly);
        ly += 14;
      }
    }

    const buttons: Array<{ label: string; variant: ButtonVariant; onClick: () => void }> = [];
    if (def.slot) {
      buttons.push({
        label: 'Equip', variant: 'primary',
        onClick: () => {
          const res = equipItem(stack.itemId, this.world.player);
          if (!res.ok) this.flash(res.reason ?? 'Cannot equip.');
        },
      });
    } else if (def.kind === 'consumable') {
      buttons.push({
        label: 'Use', variant: 'primary',
        onClick: () => {
          const res = useItem(stack.itemId, this.world.player);
          if (!res.ok) this.flash(res.reason ?? 'Cannot use.');
        },
      });
    }
    if (def.kind !== 'quest') {
      const value = Math.max(1, Math.round(def.value * 0.4));
      buttons.push({
        label: `Sell for ${value}g`, variant: 'secondary',
        onClick: () => sellItem(stack.itemId, 1),
      });
    }

    let by = rect.y + rect.h - buttons.length * 36;
    for (const b of buttons) {
      if (button(ctx, this.pointer, { x: rect.x, y: by, w: rect.w, h: 30 }, b.label,
        { variant: b.variant, fontSize: 12 })) {
        b.onClick();
      }
      by += 36;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Skills                                                             */
  /* ------------------------------------------------------------------ */

  private renderSkills(ctx: CanvasRenderingContext2D, rect: Rect): void {
    const tree = activeTree();
    const player = this.world.player;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = bodyFont(12, 700);
    ctx.fillStyle = C.gold;
    ctx.fillText(
      `${state.skillPoints} skill point${state.skillPoints === 1 ? '' : 's'} available`, rect.x, rect.y,
    );

    const respecRect: Rect = { x: rect.x + rect.w - 90, y: rect.y - 4, w: 90, h: 24 };
    if (button(ctx, this.pointer, respecRect, this.pendingRespec ? 'Sure?' : 'Respec',
      { variant: 'danger', fontSize: 10 })) {
      if (this.pendingRespec) {
        const refunded = respec(player);
        this.pendingRespec = false;
        this.flash(`Refunded ${refunded} skill point${refunded === 1 ? '' : 's'}.`);
      } else {
        this.pendingRespec = true;
      }
    }

    const treeRect: Rect = { x: rect.x, y: rect.y + 30, w: 456, h: rect.h - 30 };
    const nodeR = 22;
    const cellW = 68;
    const cellH = 66;
    const maxTier = tree.nodes.reduce((m, n) => Math.max(m, n.tier), 0);
    const maxScroll = Math.max(0, (maxTier + 1) * cellH + 20 - treeRect.h);
    this.skillScroll = clamp(this.skillScroll, 0, maxScroll);

    const posOf = (node: { tier: number; column: number }) => ({
      x: treeRect.x + node.column * cellW + nodeR + 12,
      y: treeRect.y + node.tier * cellH + nodeR + 12 - this.skillScroll,
    });
    const byId = new Map(tree.nodes.map((n) => [n.id, n]));

    ctx.save();
    ctx.beginPath();
    ctx.rect(treeRect.x, treeRect.y, treeRect.w, treeRect.h);
    ctx.clip();

    // Prerequisite lines, drawn before the nodes so the circles sit on top.
    for (const node of tree.nodes) {
      const to = posOf(node);
      for (const reqId of node.requires ?? []) {
        const reqNode = byId.get(reqId);
        if (!reqNode) continue;
        const from = posOf(reqNode);
        ctx.strokeStyle = alpha(C.mist, 0.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    for (const node of tree.nodes) {
      const { x: nx, y: ny } = posOf(node);
      if (ny + nodeR < treeRect.y || ny - nodeR > treeRect.y + treeRect.h) continue;
      const status = nodeStatus(node);
      const color = tree.branches[node.branch]?.color ?? C.aether;
      const selected = this.selectedSkill === node.id;

      ctx.beginPath();
      ctx.arc(nx, ny, nodeR, 0, TAU);
      ctx.fillStyle = status.rank > 0 ? alpha(color, 0.35) : alpha(C.duskBlue, 0.7);
      ctx.fill();
      ctx.strokeStyle = status.maxed ? color : status.unlocked ? alpha(color, 0.75) : alpha(C.stoneDark, 0.9);
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = displayFont(16);
      ctx.fillStyle = status.unlocked ? C.bone : alpha(C.boneDim, 0.4);
      ctx.fillText(node.icon, nx, ny - 2);
      if (node.maxRank > 1) {
        ctx.font = bodyFont(8, 700);
        ctx.fillStyle = alpha(C.bone, 0.85);
        ctx.fillText(`${status.rank}/${node.maxRank}`, nx, ny + nodeR - 3);
      }

      const hitRect: Rect = { x: nx - nodeR, y: ny - nodeR, w: nodeR * 2, h: nodeR * 2 };
      if (this.pointer.clicked(hitRect)) this.selectedSkill = node.id;
    }
    ctx.restore();

    const detailRect: Rect = { x: rect.x + 476, y: rect.y + 30, w: rect.w - 476, h: rect.h - 30 };
    this.renderSkillDetail(ctx, detailRect, tree.nodes.find((n) => n.id === this.selectedSkill));
  }

  private renderSkillDetail(
    ctx: CanvasRenderingContext2D, rect: Rect, node: ReturnType<typeof activeTree>['nodes'][number] | undefined,
  ): void {
    if (!node) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = bodyFont(12, 500);
      ctx.fillStyle = alpha(C.boneDim, 0.6);
      ctx.fillText('Select a node.', rect.x, rect.y);
      return;
    }

    const status = nodeStatus(node);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = displayFont(15);
    ctx.fillStyle = C.bone;
    ctx.fillText(node.name, rect.x, rect.y + 15);

    ctx.font = bodyFont(10, 600);
    ctx.fillStyle = alpha(C.boneDim, 0.85);
    ctx.fillText(`Rank ${status.rank} / ${node.maxRank} · Cost ${node.cost}`, rect.x, rect.y + 30);

    ctx.font = bodyFont(11, 500);
    ctx.fillStyle = alpha(C.bone, 0.9);
    let ly = rect.y + 50;
    for (const line of wrapText(ctx, node.description, rect.w).slice(0, 4)) {
      ctx.fillText(line, rect.x, ly);
      ly += 15;
    }

    if (!status.unlocked && status.blockedReason) {
      ly += 6;
      ctx.font = bodyFont(10, 600);
      ctx.fillStyle = C.blood;
      for (const line of wrapText(ctx, status.blockedReason, rect.w)) {
        ctx.fillText(line, rect.x, ly);
        ly += 13;
      }
    }

    const learnRect: Rect = { x: rect.x, y: rect.y + rect.h - 36, w: rect.w, h: 30 };
    const label = status.maxed ? 'Mastered' : 'Learn';
    if (button(ctx, this.pointer, learnRect, label,
      { variant: 'primary', disabled: status.maxed || !status.affordable })) {
      const res = spendPoint(node.id, this.world.player);
      if (!res.ok) this.flash(res.reason ?? 'Cannot learn that.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Quests                                                             */
  /* ------------------------------------------------------------------ */

  private renderQuests(ctx: CanvasRenderingContext2D, rect: Rect): void {
    const list = state.activeQuests;
    if (list.length === 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = bodyFont(13, 500);
      ctx.fillStyle = alpha(C.boneDim, 0.6);
      ctx.fillText('No active quests.', rect.x + rect.w / 2, rect.y + rect.h / 2);
      return;
    }

    const cardH = 86;
    const gap = 10;
    const maxScroll = Math.max(0, list.length * (cardH + gap) - gap - rect.h);
    this.questScroll = clamp(this.questScroll, 0, maxScroll);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    list.forEach((progress, i) => {
      const y = rect.y + i * (cardH + gap) - this.questScroll;
      if (y + cardH < rect.y || y > rect.y + rect.h) return;
      this.renderQuestCard(ctx, { x: rect.x, y, w: rect.w, h: cardH }, progress);
    });
    ctx.restore();
  }

  private renderQuestCard(ctx: CanvasRenderingContext2D, rect: Rect, progress: QuestProgress): void {
    const def = getQuest(progress.questId);

    ctx.fillStyle = alpha(C.duskBlue, 0.55);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = progress.readyToTurnIn ? C.gold : alpha(C.mist, 0.5);
    ctx.lineWidth = progress.readyToTurnIn ? 2 : 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = displayFont(13);
    ctx.fillStyle = def.kind === 'main' ? C.gold : C.bone;
    ctx.fillText(def.name, rect.x + 14, rect.y + 20);

    ctx.textAlign = 'right';
    ctx.font = bodyFont(9, 700);
    ctx.fillStyle = alpha(C.boneDim, 0.75);
    ctx.fillText(def.kind === 'main' ? 'MAIN QUEST' : 'SIDE QUEST', rect.x + rect.w - 14, rect.y + 18);

    ctx.textAlign = 'left';
    ctx.font = bodyFont(11, 500);
    let oy = rect.y + 38;
    for (const [i, objective] of def.objectives.slice(0, 3).entries()) {
      const p = objectiveProgress(def.id, i);
      ctx.fillStyle = p.done ? alpha(C.verdant, 0.9) : alpha(C.boneDim, 0.9);
      ctx.fillText(`${p.done ? '✓' : '•'} ${objective.label} (${p.current}/${p.required})`, rect.x + 14, oy);
      oy += 15;
    }

    if (progress.readyToTurnIn) {
      ctx.textAlign = 'right';
      ctx.font = bodyFont(11, 700);
      ctx.fillStyle = C.gold;
      ctx.fillText(`Ready — return to ${def.turnInTo ?? def.giver}`, rect.x + rect.w - 14, rect.y + rect.h - 10);
    } else if (def.kind !== 'main') {
      const armed = this.pendingAbandon === def.id;
      const abandonRect: Rect = { x: rect.x + rect.w - 84, y: rect.y + rect.h - 28, w: 70, h: 20 };
      if (button(ctx, this.pointer, abandonRect, armed ? 'Sure?' : 'Abandon',
        { variant: 'danger', fontSize: 9 })) {
        if (armed) {
          quests.abandon(def.id);
          this.pendingAbandon = null;
        } else {
          this.pendingAbandon = def.id;
        }
      }
    }
  }
}
