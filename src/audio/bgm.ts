/**
 * BGM：现场合成的循环曲子（同样不依赖任何音频文件）。
 *
 * 分两层：
 * - `BgmPlayer`（纯逻辑）：给定曲子与流逝时间，算出"这段时间该奏哪些音"；
 * - `WebAudioBgm`（副作用层）：把音符排进 AudioContext 的时间轴。
 * 分开是为了能在 node 里断言"120bpm、每拍 4 步 → 每步 125ms""循环到第 16 步会回绕"，
 * 而不是靠耳朵听。
 */

export type Channel = 'lead' | 'bass';

export interface TrackDef {
  id: string;
  /** 每分钟拍数 */
  bpm: number;
  /** 每拍切几步（4 = 十六分音符） */
  stepsPerBeat: number;
  /** 循环总步数 */
  steps: number;
  /** 每步一个音高（MIDI 编号），null = 休止 */
  lead: readonly (number | null)[];
  bass: readonly (number | null)[];
  wave: OscillatorType;
  gain: number;
}

export interface BgmNote {
  channel: Channel;
  /** MIDI 音高 */
  note: number;
  /** 相对曲子开始的毫秒数 */
  atMs: number;
  /** 这一步持续多久 */
  lengthMs: number;
}

/** MIDI 编号 → 频率（A4 = 69 = 440Hz） */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export function stepDurationMs(track: TrackDef): number {
  return 60000 / track.bpm / track.stepsPerBeat;
}

/** 第几拍（对循环取模） */
export function stepIndexAt(track: TrackDef, elapsedMs: number): number {
  const step = Math.floor(Math.max(0, elapsedMs) / stepDurationMs(track));
  return step % track.steps;
}

/**
 * 取 [fromMs, toMs) 区间里要奏的音。
 * 用游标而不是每帧重算——重算会漏掉边界上的音符，或者同一音重复触发两次。
 */
export class BgmPlayer {
  private cursorMs = 0;

  constructor(readonly track: TrackDef) {}

  /** 重新对齐到曲子开头（换曲/重开时用） */
  reset(atMs = 0): void {
    this.cursorMs = Math.max(0, atMs);
  }

  get positionMs(): number {
    return this.cursorMs;
  }

  /** 推进到 `toMs`，返回这期间该响的音 */
  advance(toMs: number): BgmNote[] {
    const notes: BgmNote[] = [];
    const step = stepDurationMs(this.track);
    if (toMs <= this.cursorMs) {
      this.cursorMs = Math.max(this.cursorMs, toMs);
      return notes;
    }

    // 从游标之后的下一个步边界开始铺到 toMs。
    // 关键：pattern 下标必须由 **boundary** 反推，不能用游标算——
    // 游标停在半拍上时，两者会差一步，音符就会整体串位（休止符位置全错）。
    let boundary = Math.ceil(this.cursorMs / step) * step;
    let index = Math.round(boundary / step);
    while (boundary < toMs) {
      const patternIndex = ((index % this.track.steps) + this.track.steps) % this.track.steps;
      const lead = this.track.lead[patternIndex];
      const bass = this.track.bass[patternIndex];
      if (typeof lead === 'number') notes.push({ channel: 'lead', note: lead, atMs: boundary, lengthMs: step });
      if (typeof bass === 'number') notes.push({ channel: 'bass', note: bass, atMs: boundary, lengthMs: step });
      index++;
      boundary += step;
    }
    this.cursorMs = toMs;
    return notes;
  }
}

/** 曲子表：三条短循环，够用就行；音高按 A 小调写，听起来不容易跑调 */
export const TRACKS: Record<string, TrackDef> = {
  title: {
    id: 'title',
    bpm: 96,
    stepsPerBeat: 2,
    steps: 16,
    lead: [69, null, 72, null, 76, null, 74, null, 72, null, 69, null, 67, null, 69, null],
    bass: [45, null, null, null, 43, null, null, null, 41, null, null, null, 43, null, null, null],
    wave: 'triangle',
    gain: 0.1,
  },
  fight: {
    id: 'fight',
    bpm: 150,
    stepsPerBeat: 4,
    steps: 32,
    lead: [69, 72, 76, 72, 69, 72, 76, 79, 69, 72, 76, 72, 74, 72, 69, 67, 69, 72, 76, 72, 69, 72, 76, 81, 79, 76, 74, 72, 69, null, 67, null],
    bass: [45, 45, null, 45, 45, null, 43, null, 41, 41, null, 41, 43, null, 45, null, 45, 45, null, 45, 45, null, 43, null, 41, null, 40, null, 43, null, 45, null],
    wave: 'square',
    gain: 0.07,
  },
  fightBoss: {
    id: 'fightBoss',
    bpm: 168,
    stepsPerBeat: 4,
    steps: 32,
    // BOSS 战：更密的低音 + 半音上行，压迫感更强
    lead: [69, 70, 69, 67, 69, 72, 74, 76, 79, 76, 74, 72, 70, 69, 67, 64, 69, 70, 69, 67, 69, 72, 74, 76, 81, 79, 76, 74, 72, 70, 69, 68],
    bass: [38, 38, null, 38, 38, null, 36, null, 34, 34, null, 34, 36, null, 38, null, 38, 38, null, 38, 38, null, 36, null, 34, null, 33, null, 36, null, 38, null],
    wave: 'sawtooth',
    gain: 0.06,
  },
  result: {
    id: 'result',
    bpm: 132,
    stepsPerBeat: 2,
    steps: 8,
    lead: [72, 76, 79, 84, null, null, null, null],
    bass: [48, null, 48, null, 43, null, 43, null],
    wave: 'triangle',
    gain: 0.11,
  },
};

export interface BgmSink {
  setTrack(id: string | null): void;
  setVolume(volume: number): void;
  /** 每帧调用（传当前毫秒） */
  update(nowMs: number): void;
  /** 暂停时把音量压下去（不是停掉，回来还能接着响） */
  setDucked(ducked: boolean): void;
}

/** 记账用（测试/静音） */
export class NullBgm implements BgmSink {
  readonly played: BgmNote[] = [];
  trackId: string | null = null;
  volume = 0;
  ducked = false;
  setTrack(id: string | null): void {
    this.trackId = id;
  }
  setVolume(volume: number): void {
    this.volume = volume;
  }
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
  }
  update(): void {}
}

type AudioCtor = new () => AudioContext;

/** 真播放：一个主音量节点 + 每次音符一个振荡器 */
export class WebAudioBgm implements BgmSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private player: BgmPlayer | null = null;
  private track: TrackDef | null = null;
  private volume = 0.25;
  private ducked = false;
  private lastMs = 0;
  private failed = false;

  /** 当前曲目 id（自测/调试用） */
  get trackId(): string | null {
    return this.track?.id ?? null;
  }

  private ensure(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx;
    const ctor = (globalThis as unknown as { AudioContext?: AudioCtor }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!ctor) {
      this.failed = true;
      return null;
    }
    try {
      this.ctx = new ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.effectiveGain();
      this.master.connect(this.ctx.destination);
    } catch {
      this.failed = true;
      this.ctx = null;
    }
    return this.ctx;
  }

  private effectiveGain(): number {
    return Math.min(1, Math.max(0, this.volume)) * (this.ducked ? 0.25 : 1);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = this.effectiveGain();
  }

  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (this.master) this.master.gain.value = this.effectiveGain();
  }

  setTrack(id: string | null): void {
    if (id === this.track?.id) return;
    this.track = id ? (TRACKS[id] ?? null) : null;
    this.player = this.track ? new BgmPlayer(this.track) : null;
    this.lastMs = 0;
    this.ensure();
  }

  update(nowMs: number): void {
    const ctx = this.ensure();
    const track = this.track;
    const player = this.player;
    if (!ctx || !track || !player || !this.master) return;
    if (ctx.state === 'suspended') return;

    // 每帧只推进一点点；页面切后台回来时会有大跳跃，夹住避免一次排上百个音
    const delta = Math.min(250, Math.max(0, nowMs - this.lastMs));
    this.lastMs = nowMs;
    const notes = player.advance(player.positionMs + delta);
    for (const n of notes) {
      const start = ctx.currentTime + 0.01;
      const dur = (n.lengthMs / 1000) * 0.9;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = track.wave;
      osc.frequency.value = midiToHz(n.note);
      const peak = track.gain * (n.channel === 'bass' ? 1.2 : 1);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
  }
}
