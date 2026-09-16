/**
 * Audio layer.
 *
 * Sounds are *data*: every effect is a SoundDef record, and a def is either a
 * synthesised placeholder (what ships today) or a URL to a real audio file.
 * Swapping in recorded audio later means changing the data, never the call
 * sites — gameplay code only ever says `audio.sfx('hit_flesh')`.
 */

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface SynthLayer {
  wave: Waveform | 'noise';
  /** Start frequency in Hz (ignored for noise). */
  freq: number;
  /** Optional end frequency for a pitch sweep. */
  freqEnd?: number;
  gain: number;
  attack: number;
  decay: number;
  /** Low-pass cutoff in Hz; omit for no filtering. */
  cutoff?: number;
  /** Seconds to wait before this layer starts. */
  delay?: number;
}

export interface SoundDef {
  id: string;
  /** Synthesised placeholder definition. */
  layers?: SynthLayer[];
  /** Path to a real audio file; takes precedence over `layers` once provided. */
  src?: string;
  volume?: number;
  /** Random pitch variation (+/- this fraction) so repeats do not machine-gun. */
  pitchJitter?: number;
  /** Minimum ms between retriggers; stops 20 hits in a frame stacking to mud. */
  throttleMs?: number;
}

export interface MusicTrackDef {
  id: string;
  /** Root note in Hz. */
  root: number;
  /** Scale degrees as semitone offsets. */
  scale: number[];
  /** Seconds between arpeggio notes. */
  noteInterval: number;
  padGain: number;
  leadGain: number;
  wave: Waveform;
  /** Higher is brighter/more open. */
  cutoff: number;
}

export type BusName = 'master' | 'music' | 'sfx';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly defs = new Map<string, SoundDef>();
  private readonly lastPlayed = new Map<string, number>();
  private readonly tracks = new Map<string, MusicTrackDef>();

  private currentTrack: string | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNodes: AudioScheduledSourceNode[] = [];

  readonly volumes: Record<BusName, number> = { master: 0.8, music: 0.5, sfx: 0.8 };
  muted = false;
  unlocked = false;

  /** Registers sound definitions; safe to call repeatedly. */
  register(defs: readonly SoundDef[]): void {
    for (const def of defs) this.defs.set(def.id, def);
  }

  registerMusic(tracks: readonly MusicTrackDef[]): void {
    for (const t of tracks) this.tracks.set(t.id, t);
  }

  /**
   * Browsers require a user gesture before audio starts. Called from the first
   * pointer/key event; harmless if called again.
   */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
      this.buildNoiseBuffer();
      this.unlocked = true;

      // A track may have been requested before the gesture arrived.
      if (this.currentTrack) {
        const pending = this.currentTrack;
        this.currentTrack = null;
        this.playMusic(pending);
      }
    } catch (err) {
      console.warn('[audio] unavailable', err);
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  setVolume(bus: BusName, value: number): void {
    this.volumes[bus] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.musicGain || !this.sfxGain) return;
    const m = this.muted ? 0 : this.volumes.master;
    this.masterGain.gain.value = m;
    this.musicGain.gain.value = this.volumes.music;
    this.sfxGain.gain.value = this.volumes.sfx;
  }

  /** Plays a registered sound. Unknown ids warn once and are then ignored. */
  sfx(id: string, volumeScale = 1): void {
    const def = this.defs.get(id);
    if (!def) {
      if (!this.warned.has(id)) {
        this.warned.add(id);
        console.warn(`[audio] no sound registered for "${id}"`);
      }
      return;
    }
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = performance.now();
    if (def.throttleMs) {
      const last = this.lastPlayed.get(id) ?? -Infinity;
      if (now - last < def.throttleMs) return;
      this.lastPlayed.set(id, now);
    }

    if (def.src) {
      this.playBuffer(def, volumeScale);
      return;
    }
    if (!def.layers) return;

    const jitter = def.pitchJitter ?? 0;
    const pitch = 1 + (Math.random() * 2 - 1) * jitter;
    const base = (def.volume ?? 1) * volumeScale;
    for (const layer of def.layers) this.playLayer(layer, pitch, base);
  }

  private readonly warned = new Set<string>();

  private playLayer(layer: SynthLayer, pitch: number, volume: number): void {
    const ctx = this.ctx;
    const dest = this.sfxGain;
    if (!ctx || !dest) return;

    const t0 = ctx.currentTime + (layer.delay ?? 0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, layer.gain * volume),
      t0 + Math.max(0.001, layer.attack),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + layer.attack + layer.decay);

    let node: AudioNode = gain;
    if (layer.cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = layer.cutoff;
      gain.connect(filter);
      filter.connect(dest);
      node = filter;
    } else {
      gain.connect(dest);
    }
    void node;

    let source: AudioScheduledSourceNode;
    if (layer.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = pitch;
      source = src;
    } else {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.freq * pitch, t0);
      if (layer.freqEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, layer.freqEnd * pitch),
          t0 + layer.attack + layer.decay,
        );
      }
      source = osc;
    }
    source.connect(gain);
    source.start(t0);
    source.stop(t0 + layer.attack + layer.decay + 0.05);
  }

  private async playBuffer(def: SoundDef, volumeScale: number): Promise<void> {
    const ctx = this.ctx;
    const dest = this.sfxGain;
    if (!ctx || !dest || !def.src) return;
    let buffer = this.buffers.get(def.id);
    if (!buffer) {
      try {
        const res = await fetch(def.src);
        buffer = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(def.id, buffer);
      } catch (err) {
        console.warn(`[audio] failed to load ${def.src}`, err);
        return;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = (def.volume ?? 1) * volumeScale;
    src.connect(gain);
    gain.connect(dest);
    src.start();
  }

  /**
   * Starts an area's music bed. The placeholder tracks are generated: a slow
   * drone plus a sparse arpeggio in the track's scale, which gives each region
   * a distinct mood without shipping any audio files.
   */
  playMusic(id: string): void {
    if (this.currentTrack === id) return;
    this.stopMusic();
    this.currentTrack = id;
    if (!this.ctx || !this.musicGain) return;
    const track = this.tracks.get(id);
    if (!track) return;

    this.musicStep = 0;
    const step = () => {
      if (this.currentTrack !== id) return;
      this.scheduleMusicStep(track);
      this.musicTimer = window.setTimeout(step, track.noteInterval * 1000);
    };
    step();
  }

  private scheduleMusicStep(track: MusicTrackDef): void {
    const ctx = this.ctx;
    const dest = this.musicGain;
    if (!ctx || !dest) return;

    const t0 = ctx.currentTime;
    const degree = track.scale[this.musicStep % track.scale.length];
    const octave = this.musicStep % 8 < 4 ? 0 : 12;
    const freq = track.root * Math.pow(2, (degree + octave) / 12);

    // Lead note.
    const osc = ctx.createOscillator();
    osc.type = track.wave;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const dur = track.noteInterval * 1.8;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(track.leadGain, t0 + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = track.cutoff;
    osc.connect(gain);
    gain.connect(filter);
    filter.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
    this.trackNode(osc);

    // Pad drone, refreshed every four steps so it overlaps itself smoothly.
    if (this.musicStep % 4 === 0) {
      const padDur = track.noteInterval * 8;
      for (const interval of [0, 7]) {
        const pad = ctx.createOscillator();
        pad.type = 'sine';
        pad.frequency.value = (track.root / 2) * Math.pow(2, interval / 12);
        const padGain = ctx.createGain();
        padGain.gain.setValueAtTime(0.0001, t0);
        padGain.gain.exponentialRampToValueAtTime(track.padGain, t0 + 2);
        padGain.gain.setValueAtTime(track.padGain, t0 + padDur - 2);
        padGain.gain.exponentialRampToValueAtTime(0.0001, t0 + padDur);
        pad.connect(padGain);
        padGain.connect(dest);
        pad.start(t0);
        pad.stop(t0 + padDur + 0.1);
        this.trackNode(pad);
      }
    }
    this.musicStep++;
  }

  private trackNode(node: AudioScheduledSourceNode): void {
    this.musicNodes.push(node);
    node.onended = () => {
      const i = this.musicNodes.indexOf(node);
      if (i >= 0) this.musicNodes.splice(i, 1);
    };
  }

  stopMusic(): void {
    this.currentTrack = null;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    for (const node of this.musicNodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.musicNodes.length = 0;
  }

  /** Called when the app is backgrounded so it stops making noise. */
  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
