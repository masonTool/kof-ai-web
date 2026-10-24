/**
 * 选项与设置：局数 / 回合时间 / CPU 难度 / 音量 / 调试开关。
 *
 * 三条原则：
 * 1. **纯逻辑**——存盘通过注入的 `StorageLike`，node 里用假 storage 就能测；
 * 2. **读盘必消毒**——localStorage 是用户可以随便改的，非法值一律回落默认（不然一改就崩）；
 * 3. **存的是数值本身**，不是下标——以后选项顺序变了，老存档不会错位。
 */
import { CPU_LEVELS, type CpuLevel } from '../ai/cpu';
import { KEY_PRESETS } from '../input/keyboard';

export interface GameSettings {
  /** 先赢几回合（1~3） */
  roundsToWin: number;
  /** 每回合秒数（30/60/99） */
  roundSeconds: number;
  /** CPU 难度 */
  cpuLevel: CpuLevel;
  /** 音量 0~1（0 = 静音） */
  volume: number;
  /** 显示帧数/输入面板 */
  showFrameData: boolean;
  /** 显示判定框 */
  showBoxes: boolean;
  /** 键盘预设下标（见 input/keyboard.ts 的 KEY_PRESETS） */
  keyPreset: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  roundsToWin: 2,
  roundSeconds: 99,
  cpuLevel: 'normal',
  volume: 0.25,
  showFrameData: false,
  showBoxes: false,
  keyPreset: 0,
};

export const ROUNDS_CHOICES = [1, 2, 3] as const;
export const TIME_CHOICES = [30, 60, 99] as const;
export const VOLUME_CHOICES = [0, 0.25, 0.5, 0.75, 1] as const;

export type OptionKey = 'roundsToWin' | 'roundSeconds' | 'cpuLevel' | 'volume' | 'showFrameData' | 'showBoxes' | 'keyPreset';

export interface OptionRow {
  key: OptionKey;
  label: string;
  value: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_KEY = 'kof97.settings';

function clampNumber(value: unknown, choices: readonly number[], fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  // 允许"不在候选里但合法"的数值（比如音量 0.4），只夹范围
  const min = Math.min(...choices);
  const max = Math.max(...choices);
  return Math.min(max, Math.max(min, n));
}

/** 把任意输入消毒成一份合法设置（读盘、URL 参数、调试口都走这里） */
export function sanitize(raw: unknown): GameSettings {
  const obj = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const level = CPU_LEVELS.includes(obj['cpuLevel'] as CpuLevel) ? (obj['cpuLevel'] as CpuLevel) : DEFAULT_SETTINGS.cpuLevel;
  return {
    roundsToWin: Math.round(clampNumber(obj['roundsToWin'], ROUNDS_CHOICES, DEFAULT_SETTINGS.roundsToWin)),
    roundSeconds: Math.round(clampNumber(obj['roundSeconds'], TIME_CHOICES, DEFAULT_SETTINGS.roundSeconds)),
    cpuLevel: level,
    volume: Math.min(1, Math.max(0, clampNumber(obj['volume'], VOLUME_CHOICES, DEFAULT_SETTINGS.volume))),
    showFrameData: typeof obj['showFrameData'] === 'boolean' ? obj['showFrameData'] : DEFAULT_SETTINGS.showFrameData,
    showBoxes: typeof obj['showBoxes'] === 'boolean' ? obj['showBoxes'] : DEFAULT_SETTINGS.showBoxes,
    keyPreset: Math.round(clampNumber(obj['keyPreset'], [0, KEY_PRESETS.length - 1], DEFAULT_SETTINGS.keyPreset)),
  };
}

/** 选项屏要显示的行（顺序即界面顺序） */
export function optionRows(s: GameSettings): OptionRow[] {
  return [
    { key: 'roundsToWin', label: '回合数（先赢几局）', value: `${s.roundsToWin}` },
    { key: 'roundSeconds', label: '回合时间（秒）', value: `${s.roundSeconds}` },
    { key: 'cpuLevel', label: 'CPU 难度', value: { easy: '简单', normal: '普通', hard: '困难' }[s.cpuLevel] },
    { key: 'volume', label: '音量', value: s.volume === 0 ? '静音' : `${Math.round(s.volume * 100)}%` },
    { key: 'showFrameData', label: '帧数面板', value: s.showFrameData ? '开' : '关' },
    { key: 'showBoxes', label: '判定框', value: s.showBoxes ? '开' : '关' },
    { key: 'keyPreset', label: '键盘布局', value: KEY_PRESETS[s.keyPreset]?.name ?? '默认' },
  ];
}

function cycleIn<T>(choices: readonly T[], current: T, dir: number): T {
  const i = choices.indexOf(current);
  const at = i < 0 ? 0 : i;
  const next = (at + dir + choices.length) % choices.length;
  return choices[next]!;
}

export class SettingsStore {
  settings: GameSettings;

  constructor(private readonly storage: StorageLike | null = null) {
    this.settings = { ...DEFAULT_SETTINGS };
    this.load();
  }

  /** 读盘；任何异常都只是一份默认设置（不影响开局） */
  load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      if (!raw) return;
      this.settings = sanitize(JSON.parse(raw));
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // 存不进去（隐私模式/配额满）不该影响游戏
    }
  }

  /** 左右切换某一项（选项屏用） */
  cycle(key: OptionKey, dir: 1 | -1 = 1): void {
    const s = this.settings;
    switch (key) {
      case 'roundsToWin':
        s.roundsToWin = cycleIn(ROUNDS_CHOICES, s.roundsToWin, dir);
        break;
      case 'roundSeconds':
        s.roundSeconds = cycleIn(TIME_CHOICES, s.roundSeconds, dir);
        break;
      case 'cpuLevel':
        s.cpuLevel = cycleIn(CPU_LEVELS, s.cpuLevel, dir);
        break;
      case 'volume':
        s.volume = cycleIn(VOLUME_CHOICES, s.volume, dir);
        break;
      case 'showFrameData':
        s.showFrameData = !s.showFrameData;
        break;
      case 'showBoxes':
        s.showBoxes = !s.showBoxes;
        break;
      case 'keyPreset':
        s.keyPreset = ((s.keyPreset + dir) % KEY_PRESETS.length + KEY_PRESETS.length) % KEY_PRESETS.length;
        break;
    }
    this.save();
  }

  /** 恢复默认（选项屏的"重置"用） */
  resetDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
  }
}
