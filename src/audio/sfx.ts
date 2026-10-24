/**
 * 音效：WebAudio 现场合成，不依赖任何音频文件（原版音效是有版权的）。
 *
 * 结构分三层：
 * - `SFX` 表：一个音效 = 波形 + 起止频率 + 时长 + 音量（纯数据，可测）；
 * - `SfxSink` 接口：真播放（`WebAudioSink`）与记账（`NullSink`）两种实现；
 * - `sfxForWorldEvent`：把模拟层事件翻译成音效名（纯函数，可测）。
 * 这样"打中该响什么"不依赖浏览器，也能在 node 里断言。
 */

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
}

/**
 * 音效表。
 *
 * 打击感的配方：**低频撞击（body）+ 高频噪声（crack）**。只有一个下滑音的话，
 * 听起来像电子音而不是"打到了东西"。所以每条打击音都给了 `thump`（低频下滑）
 * 和 `noise`（宽频噪声）两个量，`play()` 里分两层叠。
 */
export const SFX: Record<SfxName, SfxSpec> = {
  hitLight: { wave: 'square', from: 640, to: 220, ms: 65, gain: 0.22, noise: 0.4, thump: 0.5 },
  hitHeavy: { wave: 'sawtooth', from: 340, to: 80, ms: 140, gain: 0.3, noise: 0.55, thump: 0.9 },
  // 反击：比普通命中更"脆"更响，玩家要能凭听觉分出反击
  hitCounter: { wave: 'square', from: 900, to: 260, ms: 110, gain: 0.3, noise: 0.7, thump: 0.7 },
  guard: { wave: 'triangle', from: 940, to: 720, ms: 55, gain: 0.14, noise: 0.18 },
  // 破防：金属被砸裂的钝响
  guardCrush: { wave: 'sawtooth', from: 520, to: 120, ms: 220, gain: 0.28, noise: 0.5, thump: 0.6 },
  clash: { wave: 'triangle', from: 1500, to: 700, ms: 120, gain: 0.22, noise: 0.35 },
  ko: { wave: 'sawtooth', from: 220, to: 50, ms: 460, gain: 0.34, noise: 0.2, thump: 1 },
  whiff: { wave: 'sine', from: 460, to: 260, ms: 55, gain: 0.07, noise: 0.25 },
  // 超必杀起手：上滑 + 强噪声，像气在聚
  superStart: { wave: 'sawtooth', from: 180, to: 1200, ms: 420, gain: 0.26, noise: 0.45, thump: 0.35 },
  // 放飞行道具：短促的"呼"
  proj: { wave: 'sine', from: 300, to: 900, ms: 130, gain: 0.16, noise: 0.4 },
  menu: { wave: 'square', from: 520, to: 520, ms: 40, gain: 0.1 },
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

type AudioCtor = new () => AudioContext;

/** 真播放：第一次 play 时才建 AudioContext（浏览器要求用户交互后才能出声） */
export class WebAudioSink implements SfxSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private failed = false;

  private volume: number;

  constructor(volume = 0.22) {
    this.volume = volume;
  }

  /** 运行时改音量（选项屏用）；静音就是 0，不重建 AudioContext */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master) this.master.gain.value = this.volume;
  }

  get currentVolume(): number {
    return this.volume;
  }

  private ensure(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx;
    const ctor = (globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!ctor) {
      this.failed = true; // node / 老浏览器：静默降级
      return null;
    }
    try {
      this.ctx = new ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.failed = true;
      this.ctx = null;
    }
    return this.ctx;
  }

  /** 用户第一次点/按键时调用，解锁音频上下文 */
  resume(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
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
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;
    const dur = Math.max(0.02, spec.ms / 1000);

    const env = ctx.createGain();
    env.gain.setValueAtTime(spec.gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    env.connect(this.master);

    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(spec.from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), now + dur);
    osc.connect(env);
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
      thumpGain.connect(this.master);
      thumpOsc.start(now);
      thumpOsc.stop(now + thumpDur + 0.02);
    }

    if (spec.noise && spec.noise > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(spec.gain * spec.noise, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(ng);
      ng.connect(this.master);
      src.start(now);
      src.stop(now + dur);
    }
  }
}
