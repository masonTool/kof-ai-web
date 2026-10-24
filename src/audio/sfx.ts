/**
 * 音效：WebAudio 现场合成，不依赖任何音频文件（原版音效是有版权的）。
 *
 * 结构分三层：
 * - `SFX` 表：一个音效 = 波形 + 起止频率 + 时长 + 音量（纯数据，可测）；
 * - `SfxSink` 接口：真播放（`WebAudioSink`）与记账（`NullSink`）两种实现；
 * - `sfxForWorldEvent`：把模拟层事件翻译成音效名（纯函数，可测）。
 * 这样"打中该响什么"不依赖浏览器，也能在 node 里断言。
 */

export type SfxName = 'hitLight' | 'hitHeavy' | 'guard' | 'ko' | 'whiff' | 'menu' | 'confirm' | 'start';

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
  /** 噪声混合比例 0~1（打击感靠它） */
  noise?: number;
}

export const SFX: Record<SfxName, SfxSpec> = {
  hitLight: { wave: 'square', from: 620, to: 240, ms: 70, gain: 0.22, noise: 0.35 },
  hitHeavy: { wave: 'sawtooth', from: 320, to: 90, ms: 130, gain: 0.3, noise: 0.5 },
  guard: { wave: 'triangle', from: 900, to: 700, ms: 60, gain: 0.16, noise: 0.2 },
  ko: { wave: 'sawtooth', from: 220, to: 60, ms: 420, gain: 0.32, noise: 0.15 },
  whiff: { wave: 'sine', from: 420, to: 300, ms: 50, gain: 0.08 },
  menu: { wave: 'square', from: 520, to: 520, ms: 40, gain: 0.12 },
  confirm: { wave: 'square', from: 660, to: 990, ms: 90, gain: 0.16 },
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
      const damage = Number(data?.['damage'] ?? 0);
      return damage >= 60 ? 'hitHeavy' : 'hitLight';
    }
    case 'guard':
    case 'guardcrush':
      return 'guard';
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

  constructor(private readonly volume = 0.22) {}

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
