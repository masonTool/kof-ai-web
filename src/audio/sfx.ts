/**
 * 音效：WebAudio 现场合成，不依赖任何音频文件（原版音效是有版权的）。
 *
 * 结构分三层：
 * - `SFX` 表：一个音效 = 波形 + 起止频率 + 时长 + 音量（纯数据，可测）；
 * - `SfxSink` 接口：真播放（`WebAudioSink`）与记账（`NullSink`）两种实现；
 * - `sfxForWorldEvent`：把模拟层事件翻译成音效名（纯函数，可测）。
 * 这样"打中该响什么"不依赖浏览器，也能在 node 里断言。
 */

import { audioGraph, DEFAULT_SFX_VOLUME, setBusVolume, unlockAudio } from './graph';

export type SfxName =
  | 'hitLight'
  | 'hitHeavy'
  | 'hitCounter'
  | 'guard'
  | 'guardCrush'
  | 'clash'
  | 'ko'
  | 'whiff'
  | 'superStart'
  | 'proj'
  | 'cancel'
  | 'select'
  | 'roundStart'
  | 'swap'
  | 'tick'
  | 'win'
  | 'lose'
  | 'voiceHit'
  | 'voiceSuper'
  | 'voiceKo'
  | 'menu'
  | 'confirm'
  | 'start';

export interface SfxSpec {
  wave: OscillatorType;
  /** 起始频率（Hz） */
  from: number;
  /** 结束频率（Hz），做下滑音 */
  to: number;
  /** 时长（毫秒） */
  ms: number;
  /** 峰值音量 0~1 */
  gain: number;
  /** 噪声混合比例 0~1 */
  noise?: number;
  /** 低频撞击层（0~1）：80~180Hz 的正弦短促下滑，负责"沉"的那一半 */
  thump?: number;
  /** 带通滤波（人声靠它：没有滤波的锯齿波听起来是"电子叫"） */
  filter?: { type: BiquadFilterType; freq: number; q: number };
  /**
   * 中频补偿（0~1）：手机小喇叭放不出低频，打击音必须补一层 1.2~1.6kHz 窄带噪声，
   * 否则"打到东西"在手机上听起来就是"噗"一下。
   */
  presence?: number;
}

/**
 * 音效表。
 *
 * 打击感的配方：**低频撞击（body）+ 高频噪声（crack）**。只有一个下滑音的话，
 * 听起来像电子音而不是"打到了东西"。所以每条打击音都给了 `thump`（低频下滑）
 * 和 `noise`（宽频噪声）两个量，`play()` 里分两层叠。
 */
export const SFX: Record<SfxName, SfxSpec> = {
  hitLight: { wave: 'square', from: 640, to: 220, ms: 65, gain: 0.22, noise: 0.4, thump: 0.5, presence: 0.5 },
  hitHeavy: { wave: 'sawtooth', from: 340, to: 80, ms: 140, gain: 0.3, noise: 0.55, thump: 0.9, presence: 0.75 },
  // 反击：比普通命中更"脆"更响，玩家要能凭听觉分出反击
  hitCounter: { wave: 'square', from: 900, to: 260, ms: 110, gain: 0.3, noise: 0.7, thump: 0.7, presence: 0.85 },
  guard: { wave: 'triangle', from: 940, to: 720, ms: 55, gain: 0.14, noise: 0.18, presence: 0.35 },
  // 破防：金属被砸裂的钝响
  guardCrush: { wave: 'sawtooth', from: 520, to: 120, ms: 220, gain: 0.28, noise: 0.5, thump: 0.6, presence: 0.6 },
  clash: { wave: 'triangle', from: 1500, to: 700, ms: 120, gain: 0.22, noise: 0.35 },
  ko: { wave: 'sawtooth', from: 220, to: 50, ms: 460, gain: 0.34, noise: 0.2, thump: 1, presence: 0.5 },
  whiff: { wave: 'sine', from: 460, to: 260, ms: 55, gain: 0.07, noise: 0.25 },
  // 超必杀起手：上滑 + 强噪声，像气在聚
  superStart: { wave: 'sawtooth', from: 180, to: 1200, ms: 420, gain: 0.26, noise: 0.45, thump: 0.35 },
  // 放飞行道具：短促的"呼"
  proj: { wave: 'sine', from: 300, to: 900, ms: 130, gain: 0.16, noise: 0.4 },
  // 人声：锯齿波 + 带通，做出"喊"的共振峰。不是真人录音（原版语音有版权），
  // 但在混音里足够听出"有人被打到了"
  voiceHit: { wave: 'sawtooth', from: 430, to: 150, ms: 190, gain: 0.14, noise: 0.12, filter: { type: 'bandpass', freq: 900, q: 1.6 } },
  voiceSuper: { wave: 'sawtooth', from: 240, to: 640, ms: 460, gain: 0.15, noise: 0.1, filter: { type: 'bandpass', freq: 1100, q: 2.2 } },
  voiceKo: { wave: 'sawtooth', from: 320, to: 90, ms: 520, gain: 0.16, noise: 0.1, filter: { type: 'bandpass', freq: 700, q: 1.4 } },
  menu: { wave: 'square', from: 520, to: 520, ms: 40, gain: 0.1 },
  cancel: { wave: 'square', from: 420, to: 220, ms: 80, gain: 0.12 },
  select: { wave: 'square', from: 700, to: 1100, ms: 90, gain: 0.16 },
  roundStart: { wave: 'square', from: 520, to: 790, ms: 240, gain: 0.2 },
  swap: { wave: 'triangle', from: 300, to: 640, ms: 170, gain: 0.14 },
  tick: { wave: 'square', from: 1200, to: 1200, ms: 35, gain: 0.09 },
  win: { wave: 'triangle', from: 660, to: 990, ms: 300, gain: 0.2 },
  lose: { wave: 'sawtooth', from: 300, to: 110, ms: 420, gain: 0.18 },
  confirm: { wave: 'square', from: 660, to: 990, ms: 90, gain: 0.15 },
  start: { wave: 'square', from: 440, to: 880, ms: 180, gain: 0.2 },
};

export interface SfxSink {
  play(name: SfxName): void;
}

/** 记账用（测试 / 静音模式） */
export class NullSink implements SfxSink {
  readonly played: SfxName[] = [];
  play(name: SfxName): void {
    this.played.push(name);
  }
  clear(): void {
    this.played.length = 0;
  }
}

/** 把模拟层事件翻译成音效名 */
export function sfxForWorldEvent(type: string, data?: Readonly<Record<string, number | string | boolean>>): SfxName | null {
  switch (type) {
    case 'hit': {
      if (data?.['counter'] === true || data?.['counter'] === 1) return 'hitCounter';
      const damage = Number(data?.['damage'] ?? 0);
      return damage >= 60 ? 'hitHeavy' : 'hitLight';
    }
    case 'guard':
      return 'guard';
    case 'guardcrush':
      return 'guardCrush';
    case 'clash':
      return 'clash';
    case 'superstart':
      return 'superStart';
    case 'proj':
      return 'proj';
    case 'ko':
    case 'dizzy':
      return 'ko';
    default:
      return null;
  }
}

/**
 * 人声：只在这些时刻喊（每次都喊会很吵）
 * - 重击 / 反击命中
 * - 超必杀起手
 * - KO
 */
export function voiceForWorldEvent(
  type: string,
  data?: Readonly<Record<string, number | string | boolean>>,
): SfxName | null {
  switch (type) {
    case 'superstart':
      return 'voiceSuper';
    case 'ko':
      return 'voiceKo';
    case 'hit': {
      const damage = Number(data?.['damage'] ?? 0);
      return data?.['counter'] === true || damage >= 60 ? 'voiceHit' : null;
    }
    case 'superhit':
      return 'voiceHit';
    default:
      return null;
  }
}

/**
 * 真播放：走全局音频图的 **音效总线**（见 `graph.ts`）。
 *
 * 总线后面挂了压缩器，所以密集连段不会把手机小喇叭推爆；
 * `setVolume` 调的是这条总线，和 BGM 完全独立。
 */
export class WebAudioSink implements SfxSink {
  private noiseBuffer: AudioBuffer | null = null;
  private volume: number = DEFAULT_SFX_VOLUME;

  constructor(volume = DEFAULT_SFX_VOLUME) {
    this.volume = volume;
    setBusVolume('sfx', volume);
  }

  /** 运行时改音量（选项屏用）；静音就是 0，不重建 AudioContext */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(1e-4, volume));
    setBusVolume('sfx', this.volume);
  }

  get currentVolume(): number {
    return this.volume;
  }

  /** 兼容旧调用：现在等价于全局解锁（两条总线一起） */
  resume(): void {
    unlockAudio();
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  play(name: SfxName): void {
    const spec = SFX[name];
    const g = audioGraph();
    if (!g) return;
    const { ctx } = g;

    const now = ctx.currentTime;
    const dur = Math.max(0.02, spec.ms / 1000);

    const env = ctx.createGain();
    env.gain.setValueAtTime(spec.gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    env.connect(g.sfx);

    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(spec.from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), now + dur);
    if (spec.filter) {
      // 带通滤掉低频和超高频，只留"共振峰"那一段，才像嗓子而不是振荡器
      const bp = ctx.createBiquadFilter();
      bp.type = spec.filter.type;
      bp.frequency.setValueAtTime(spec.filter.freq, now);
      bp.Q.setValueAtTime(spec.filter.q, now);
      osc.connect(bp);
      bp.connect(env);
    } else {
      osc.connect(env);
    }
    osc.start(now);
    osc.stop(now + dur + 0.02);

    if (spec.thump && spec.thump > 0) {
      // 低频撞击：一条 120→45Hz 的正弦在 120ms 内衰减，这才是"咚"的来源
      const thumpOsc = ctx.createOscillator();
      thumpOsc.type = 'sine';
      const thumpGain = ctx.createGain();
      const thumpDur = Math.min(0.22, dur + 0.06);
      thumpGain.gain.setValueAtTime(spec.gain * spec.thump * 1.4, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + thumpDur);
      thumpOsc.frequency.setValueAtTime(120, now);
      thumpOsc.frequency.exponentialRampToValueAtTime(45, now + thumpDur);
      thumpOsc.connect(thumpGain);
      thumpGain.connect(g.sfx);
      thumpOsc.start(now);
      thumpOsc.stop(now + thumpDur + 0.02);
    }

    // 手机外放补偿：小喇叭放不出 100Hz 以下，也放不出响亮的高频，
    // 所以打击音必须补一层 1.2~1.6kHz 的窄带噪声——人耳对这个频段最敏感，
    // 手机外放下"打到东西"的感觉基本全靠它。
    if (spec.presence && spec.presence > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1400, now);
      bp.Q.setValueAtTime(0.9, now);
      const gain = ctx.createGain();
      const len = Math.min(0.14, dur * 1.6);
      gain.gain.setValueAtTime(spec.gain * spec.presence, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + len);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(g.sfx);
      src.start(now);
      src.stop(now + len + 0.02);
    }

    if (spec.noise && spec.noise > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(spec.gain * spec.noise, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(ng);
      ng.connect(g.sfx);
      src.start(now);
      src.stop(now + dur);
    }
  }
}
