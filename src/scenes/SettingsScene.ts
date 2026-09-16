import { C, alpha } from '../art/palette';
import type { Renderer } from '../engine/Renderer';
import { Scene } from '../engine/Scene';
import { state } from '../game/GameState';
import { trySaves } from '../game/saves';
import { button, panel, PointerTracker, sectionTitle, slider, toggle, type Rect } from '../ui/widgets';

/**
 * Settings, reachable both from the title screen and from the in-game pause
 * menu — the same scene serves both, since the settings themselves and the
 * rules for applying them do not differ by context. Every control writes
 * straight to `state.settings` and the relevant engine subsystem immediately,
 * then persists it, so there is no separate "Apply" step to forget.
 */
export class SettingsScene extends Scene {
  override readonly transparent = true;
  private pointer = new PointerTracker();

  override suspend(): void {
    this.pointer.reset();
  }

  override frameUpdate(): void {
    this.pointer.update(this.game.controls.input);
  }

  override render(r: Renderer): void {
    const ctx = r.ctx;
    ctx.save();
    r.clipToView();
    ctx.fillStyle = alpha(C.void, 0.72);
    ctx.fillRect(0, 0, r.viewWidth, r.viewHeight);

    const w = Math.min(460, r.viewWidth - 60);
    const h = Math.min(430, r.viewHeight - 40);
    const rect: Rect = { x: r.viewWidth / 2 - w / 2, y: r.viewHeight / 2 - h / 2, w, h };
    panel(ctx, rect, { alpha: 0.97 });

    sectionTitle(ctx, rect.x + 22, rect.y + 34, 'Settings');

    const colX = rect.x + 26;
    const colW = rect.w - 52;
    let y = rect.y + 64;
    const rowGap = 46;

    const { settings } = state;
    const audio = this.game.audio;

    const master = slider(ctx, this.pointer, { x: colX, y, w: colW, h: 18 }, settings.masterVolume, 'Master Volume');
    if (master !== settings.masterVolume) {
      settings.masterVolume = master;
      audio.setVolume('master', master);
    }
    y += rowGap;

    const music = slider(ctx, this.pointer, { x: colX, y, w: colW, h: 18 }, settings.musicVolume, 'Music');
    if (music !== settings.musicVolume) {
      settings.musicVolume = music;
      audio.setVolume('music', music);
    }
    y += rowGap;

    const sfx = slider(ctx, this.pointer, { x: colX, y, w: colW, h: 18 }, settings.sfxVolume, 'Sound Effects');
    if (sfx !== settings.sfxVolume) {
      settings.sfxVolume = sfx;
      audio.setVolume('sfx', sfx);
    }
    y += rowGap;

    const muted = toggle(ctx, this.pointer, { x: colX, y, w: colW, h: 26 }, settings.muted, 'Mute All Audio');
    if (muted !== settings.muted) {
      settings.muted = muted;
      audio.setMuted(muted);
    }
    y += 38;

    const shakeVal = slider(ctx, this.pointer, { x: colX, y, w: colW, h: 18 }, settings.screenShake, 'Screen Shake');
    if (shakeVal !== settings.screenShake) settings.screenShake = shakeVal;
    y += rowGap;

    settings.showDamageNumbers = toggle(
      ctx, this.pointer, { x: colX, y, w: colW, h: 26 }, settings.showDamageNumbers, 'Damage Numbers',
    );
    y += 34;

    settings.aimAssist = toggle(
      ctx, this.pointer, { x: colX, y, w: colW, h: 26 }, settings.aimAssist, 'Touch Aim Assist',
    );
    y += 34;

    settings.performanceMode = toggle(
      ctx, this.pointer, { x: colX, y, w: colW, h: 26 }, settings.performanceMode, 'Performance Mode',
    );
    y += 34;

    settings.forceTouchControls = toggle(
      ctx, this.pointer, { x: colX, y, w: colW, h: 26 }, settings.forceTouchControls,
      'Always Show Touch Controls',
    );
    if (settings.forceTouchControls) this.game.controls.pad.visible = true;

    const closeRect: Rect = { x: rect.x + rect.w - 96, y: rect.y + rect.h - 46, w: 78, h: 34 };
    if (button(ctx, this.pointer, closeRect, 'Done')) {
      void trySaves()?.saveSettings();
      this.game.scenes.pop();
    }
    ctx.restore();
  }

  override onBack(): boolean {
    void trySaves()?.saveSettings();
    this.game.scenes.pop();
    return true;
  }
}
