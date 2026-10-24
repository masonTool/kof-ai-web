/**
 * 选项与设置：局数 / 回合时间 / CPU 难度 / 音量 / 调试开关。
 *
 * 三条原则：
 * 1. **纯逻辑**——存盘通过注入的 `StorageLike`，node 里用假 storage 就能测；
 * 2. **读盘必消毒**——localStorage 是用户可以随便改的，非法值一律回落默认（不然一改就崩）；
 * 3. **存的是数值本身**，不是下标——以后选项顺序变了，老存档不会错位。
 */
import { CPU_LEVELS, type CpuLevel } from '../ai/cpu';
import { Btn } from '../core/input';
import { KEY_PRESETS, keyPresetAt, type KeyMap } from '../input/keyboard';

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
  /** 像素粒度：1 = 最细（默认）、2/4 = 越来越粗 */
  pixelSize: number;
  /** 逐键自定义（只存与预设不同的项） */
  customKeys: CustomKeys;
}

export const DEFAULT_SETTINGS: GameSettings = {
  roundsToWin: 2,
  roundSeconds: 99,
  cpuLevel: 'normal',
  volume: 0.25,
  showFrameData: false,
  showBoxes: false,
  keyPreset: 0,
  pixelSize: 1,
  customKeys: { p1: {}, p2: {} },
};

/** 可选的像素粒度（越大越"马赛克"：1 = 每逻辑像素一块，4 = 4×4 一块） */
export const PIXEL_SIZES: readonly number[] = [1, 2, 4];

export const ROUNDS_CHOICES = [1, 2, 3] as const;
export const TIME_CHOICES = [30, 60, 99] as const;
export const VOLUME_CHOICES = [0, 0.25, 0.5, 0.75, 1] as const;

export type OptionKey =
  | 'roundsToWin'
  | 'roundSeconds'
  | 'cpuLevel'
  | 'volume'
  | 'showFrameData'
  | 'showBoxes'
  | 'keyPreset'
  | 'pixelSize';

/** 可以重绑的按键动作 */
export type KeyAction = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'c' | 'd' | 'start';

export const KEY_ACTIONS: readonly { id: KeyAction; label: string; bit: number }[] = [
  { id: 'up', label: '上', bit: Btn.Up },
  { id: 'down', label: '下', bit: Btn.Down },
  { id: 'left', label: '左', bit: Btn.Left },
  { id: 'right', label: '右', bit: Btn.Right },
  { id: 'a', label: '轻拳', bit: Btn.A },
  { id: 'b', label: '轻脚', bit: Btn.B },
  { id: 'c', label: '重拳', bit: Btn.C },
  { id: 'd', label: '重脚', bit: Btn.D },
  { id: 'start', label: '开始', bit: Btn.Start },
];

/** 自定义键位：只存"与预设不同"的那些，换预设时自定义仍然生效 */
export interface CustomKeys {
  p1: Partial<Record<KeyAction, string>>;
  p2: Partial<Record<KeyAction, string>>;
}


/** 键位码只接受键盘 event.code 那种形状（字母/数字/Arrows/Space/F1…），挡掉乱写 */
const KEY_CODE_RE = /^[A-Za-z0-9]{1,20}$|^Arrow[A-Z][a-z]{2,10}$|^Space$|^Enter$|^Escape$|^F\d{1,2}$|^Numpad\d$/;

function sanitizeCustom(raw: unknown): CustomKeys {
  const out: CustomKeys = { p1: {}, p2: {} };
  if (raw === null || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const side of ['p1', 'p2'] as const) {
    const src = obj[side];
    if (src === null || typeof src !== 'object') continue;
    for (const action of KEY_ACTIONS) {
      const code = (src as Record<string, unknown>)[action.id];
      if (typeof code === 'string' && KEY_CODE_RE.test(code)) out[side][action.id] = code;
    }
  }
  return out;
}

/**
 * 按设置算出某一侧的 `KeyMap`：先取预设，再叠加自定义项。
 * 覆盖时要**先删掉同一个动作原来的按键**，否则一个动作会有两个键同时生效（改键改不掉）。
 */
export function keymapFor(settings: GameSettings, side: 1 | 2): KeyMap {
  const preset = keyPresetAt(settings.keyPreset);
  const base: KeyMap = { ...(side === 1 ? preset.p1 : preset.p2) };
  const custom = side === 1 ? settings.customKeys.p1 : settings.customKeys.p2;
  for (const action of KEY_ACTIONS) {
    const code = custom[action.id];
    if (!code) continue;
    for (const [existing, bit] of Object.entries(base)) {
      if (bit === action.bit) delete base[existing];
    }
    base[code] = action.bit;
  }
  return base;
}

/** 某个动作当前绑的键（显示用） */
export function keyLabelFor(settings: GameSettings, side: 1 | 2, action: KeyAction): string {
  const bit = KEY_ACTIONS.find((a) => a.id === action)?.bit;
  if (bit === undefined) return '-';
  const map = keymapFor(settings, side);
  const codes = Object.entries(map).filter(([, b]) => b === bit).map(([code]) => code);
  return codes.length > 0 ? codes.map(prettyKey).join(' / ') : '未绑定';
}

/** event.code → 人看得懂的名字 */
export function prettyKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  if (code === 'Space') return '空格';
  if (code === 'Enter') return '回车';
  return code;
}

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
    pixelSize: PIXEL_SIZES.includes(Number(obj['pixelSize'])) ? Number(obj['pixelSize']) : DEFAULT_SETTINGS.pixelSize,
    customKeys: sanitizeCustom(obj['customKeys']),
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
    { key: 'pixelSize', label: '像素粒度', value: `${s.pixelSize}×${s.pixelSize}` },
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
      case 'pixelSize': {
        const i = PIXEL_SIZES.indexOf(s.pixelSize);
        const next = ((i + dir) % PIXEL_SIZES.length + PIXEL_SIZES.length) % PIXEL_SIZES.length;
        s.pixelSize = PIXEL_SIZES[next]!;
        break;
      }
    }
    this.save();
  }

  /** 改一个键（重绑界面用）：写入自定义并落盘 */
  setKey(side: 1 | 2, action: KeyAction, code: string): void {
    if (!KEY_CODE_RE.test(code)) return;
    const target = side === 1 ? this.settings.customKeys.p1 : this.settings.customKeys.p2;
    // 同一个键不能同时绑两个动作：先把别的动作上用着这个键的删掉
    for (const other of KEY_ACTIONS) {
      if (other.id !== action && target[other.id] === code) delete target[other.id];
    }
    target[action] = code;
    this.save();
  }

  /** 清掉某一侧的自定义（"恢复预设"） */
  clearKeys(side: 1 | 2): void {
    if (side === 1) this.settings.customKeys.p1 = {};
    else this.settings.customKeys.p2 = {};
    this.save();
  }

  /** 恢复默认（选项屏的"重置"用） */
  resetDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
  }
}
