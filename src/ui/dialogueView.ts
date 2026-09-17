import { C, alpha, bodyFont, displayFont } from '../art/palette';
import { roundRect } from '../art/sprites';
import { clamp01, pointInRect } from '../engine/math';
import type { Controls } from '../engine/Controls';
import type { Renderer } from '../engine/Renderer';
import type { Player } from '../game/entities/Player';
import type { DialogueSystem, PresentedChoice } from '../game/systems/DialogueSystem';

/**
 * The conversation panel.
 *
 * Canvas-rendered rather than DOM: it sits over live gameplay, needs to appear
 * instantly on a button press, and its choice rows must be hit-tested in the
 * same view coordinates as the touch controls. Text is wrapped and revealed a
 * character at a time, with a tap skipping to the full line.
 */

const PANEL_MARGIN = 22;
const PANEL_HEIGHT = 168;
const CHOICE_HEIGHT = 40;
const CHOICE_GAP = 6;
/** Characters revealed per second. Fast enough not to be a wait. */
const TYPE_SPEED = 62;

interface ChoiceRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  choice: PresentedChoice;
}

export class DialogueView {
  private revealed = 0;
  private lastText = '';
  private choiceRects: ChoiceRect[] = [];
  private hoverIndex = -1;
  /** Pointer id currently pressing a choice. */
  private pressIndex = -1;

  /** Resets the typewriter when a new line appears. */
  private syncLine(text: string): void {
    if (text !== this.lastText) {
      this.lastText = text;
      this.revealed = 0;
    }
  }

  get typingComplete(): boolean {
    return this.revealed >= this.lastText.length;
  }

  /** Handles input. Returns true when the conversation is still open. */
  update(
    dt: number,
    dialogue: DialogueSystem,
    controls: Controls,
    r: Renderer,
    player: Player,
  ): boolean {
    const line = dialogue.currentLine();
    if (!line) return false;
    this.syncLine(line.text);
    this.revealed = Math.min(line.text.length, this.revealed + TYPE_SPEED * dt);

    const choices = dialogue.currentChoices();
    this.layoutChoices(choices, r);

    // Pointer: tap a choice, or tap anywhere else to advance.
    const input = controls.input;
    this.hoverIndex = this.choiceAt(input.mouseX, input.mouseY);

    const claimed = input.claimPointer('dialogue', () => true);
    if (claimed) {
      const hit = this.choiceAt(claimed.x, claimed.y);
      if (hit >= 0) {
        this.pressIndex = hit;
      } else if (!this.typingComplete) {
        this.revealed = line.text.length;
      } else if (choices.length === 0) {
        return dialogue.advance(player);
      }
    }

    // Release on a choice commits it.
    if (this.pressIndex >= 0 && !input.pointerById(claimed?.id ?? -1)) {
      const rect = this.choiceRects.find((c) => c.index === this.pressIndex);
      const index = this.pressIndex;
      this.pressIndex = -1;
      if (rect?.choice.enabled) {
        this.revealed = 0;
        this.lastText = '';
        return dialogue.choose(index, player);
      }
    }

    // Keyboard: space/enter advances, number keys pick a choice.
    if (controls.pressedRaw('confirm')) {
      if (!this.typingComplete) {
        this.revealed = line.text.length;
      } else if (choices.length === 0) {
        return dialogue.advance(player);
      } else {
        const first = choices.find((c) => c.enabled);
        if (first) {
          this.lastText = '';
          return dialogue.choose(first.index, player);
        }
      }
    }
    for (let i = 0; i < Math.min(9, choices.length); i++) {
      if (!input.wasPressed(`Digit${i + 1}`)) continue;
      const choice = choices[i];
      if (!choice.enabled) continue;
      this.lastText = '';
      return dialogue.choose(choice.index, player);
    }
    if (controls.pressedRaw('cancel') && choices.length === 0) {
      dialogue.end();
      return false;
    }

    return true;
  }

  private layoutChoices(choices: PresentedChoice[], r: Renderer): void {
    this.choiceRects.length = 0;
    if (choices.length === 0) return;

    const panelW = r.viewWidth - PANEL_MARGIN * 2 - r.safeLeft - r.safeRight;
    const x = PANEL_MARGIN + r.safeLeft;
    const totalH = choices.length * (CHOICE_HEIGHT + CHOICE_GAP);
    const panelTop = r.viewHeight - r.safeBottom - PANEL_MARGIN - PANEL_HEIGHT;
    let y = panelTop - totalH - 10;

    for (const choice of choices) {
      this.choiceRects.push({
        index: choice.index, x, y, w: panelW, h: CHOICE_HEIGHT, choice,
      });
      y += CHOICE_HEIGHT + CHOICE_GAP;
    }
  }

  private choiceAt(x: number, y: number): number {
    for (const rect of this.choiceRects) {
      if (pointInRect(x, y, rect)) return rect.index;
    }
    return -1;
  }

  render(ctx: CanvasRenderingContext2D, dialogue: DialogueSystem, r: Renderer): void {
    const line = dialogue.currentLine();
    if (!line) return;

    ctx.save();
    // Dim the world so the conversation reads as the foreground.
    ctx.fillStyle = alpha(C.void, 0.45);
    ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);

    this.renderChoices(ctx);
    this.renderPanel(ctx, line.speaker, line.text, r, dialogue.currentChoices().length === 0);
    ctx.restore();
  }

  private renderPanel(
    ctx: CanvasRenderingContext2D,
    speaker: string,
    text: string,
    r: Renderer,
    showAdvanceHint: boolean,
  ): void {
    const x = PANEL_MARGIN + r.safeLeft;
    const w = r.viewWidth - PANEL_MARGIN * 2 - r.safeLeft - r.safeRight;
    const y = r.viewHeight - r.safeBottom - PANEL_MARGIN - PANEL_HEIGHT;

    ctx.fillStyle = alpha(C.deepNight, 0.95);
    roundRect(ctx, x, y, w, PANEL_HEIGHT, 14);
    ctx.fill();
    ctx.strokeStyle = alpha(C.mist, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Speaker plate, overlapping the panel's top edge.
    ctx.font = displayFont(15);
    const nameW = ctx.measureText(speaker).width + 28;
    ctx.fillStyle = alpha(C.slate, 0.98);
    roundRect(ctx, x + 18, y - 15, nameW, 30, 9);
    ctx.fill();
    ctx.strokeStyle = alpha(C.aether, 0.7);
    ctx.stroke();
    ctx.fillStyle = C.aetherSoft;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(speaker, x + 32, y + 1);

    // Body text, revealed progressively.
    const shown = text.slice(0, Math.floor(this.revealed));
    ctx.font = bodyFont(15, 500);
    ctx.fillStyle = C.bone;
    const lines = wrapText(ctx, shown, w - 56);
    let ty = y + 40;
    for (const l of lines) {
      ctx.fillText(l, x + 28, ty);
      ty += 24;
    }

    if (showAdvanceHint && this.typingComplete) {
      // Blinking chevron in the corner: the universal "continue" affordance.
      const blink = 0.55 + Math.sin(performance.now() / 260) * 0.45;
      ctx.fillStyle = alpha(C.aether, blink);
      ctx.beginPath();
      ctx.moveTo(x + w - 34, y + PANEL_HEIGHT - 26);
      ctx.lineTo(x + w - 22, y + PANEL_HEIGHT - 20);
      ctx.lineTo(x + w - 34, y + PANEL_HEIGHT - 14);
      ctx.closePath();
      ctx.fill();
    }
  }

  private renderChoices(ctx: CanvasRenderingContext2D): void {
    ctx.textBaseline = 'middle';
    for (const rect of this.choiceRects) {
      const { choice } = rect;
      const active = this.hoverIndex === rect.index || this.pressIndex === rect.index;
      const accent = TONE_COLORS[choice.tone ?? 'default'];

      ctx.fillStyle = alpha(choice.enabled ? (active ? C.slate : C.duskBlue) : C.void, 0.94);
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
      ctx.fill();
      ctx.strokeStyle = alpha(choice.enabled ? accent : C.stoneDark, choice.enabled ? 0.8 : 0.4);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tone stripe, so quest and shop options are distinguishable at a glance.
      ctx.fillStyle = alpha(accent, choice.enabled ? 0.9 : 0.3);
      roundRect(ctx, rect.x, rect.y + 8, 3.5, rect.h - 16, 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.font = bodyFont(14, 600);
      ctx.fillStyle = choice.enabled ? C.bone : alpha(C.boneDim, 0.5);
      ctx.fillText(choice.text, rect.x + 18, rect.y + rect.h / 2);

      if (!choice.enabled && choice.reason) {
        ctx.textAlign = 'right';
        ctx.font = bodyFont(11, 500);
        ctx.fillStyle = alpha(C.blood, 0.8);
        ctx.fillText(choice.reason, rect.x + rect.w - 16, rect.y + rect.h / 2);
      }
    }
  }

  reset(): void {
    this.revealed = 0;
    this.lastText = '';
    this.choiceRects.length = 0;
    this.hoverIndex = -1;
    this.pressIndex = -1;
  }
}

const TONE_COLORS: Record<string, string> = {
  quest: C.gold,
  shop: C.ember,
  lore: C.aether,
  leave: C.stone,
  default: C.mist,
};

/** Greedy word wrap against the current font. */
export function wrapText(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export { clamp01 };
