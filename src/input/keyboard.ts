/**
 * 键盘输入源：把按键集合翻译成 `InputSample`（位掩码）。
 *
 * 键位只是默认值，T23 会把它做进设置页并本地保存；这里的 `KeyMap` 就是那份数据。
 * 纯映射函数（heldFromKeys）不碰 DOM，便于测试。
 */
import { Btn, type InputSample } from '../core/input';

/** event.code → 位掩码 */
export type KeyMap = Record<string, number>;

export const DEFAULT_KEYMAP_P1: KeyMap = {
  ArrowLeft: Btn.Left,
  ArrowRight: Btn.Right,
  ArrowUp: Btn.Up,
  ArrowDown: Btn.Down,
  KeyJ: Btn.A, // 轻拳
  KeyK: Btn.B, // 轻脚
  KeyU: Btn.C, // 重拳
  KeyI: Btn.D, // 重脚
  Enter: Btn.Start,
};

export const DEFAULT_KEYMAP_P2: KeyMap = {
  KeyA: Btn.Left,
  KeyD: Btn.Right,
  KeyW: Btn.Up,
  KeyS: Btn.Down,
  KeyG: Btn.A,
  KeyH: Btn.B,
  KeyT: Btn.C,
  KeyY: Btn.D,
  Space: Btn.Start,
};

/** 默认会被浏览器抢走的键（滚动/切页），需要拦一下 */
export const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
]);

export function heldFromKeys(keys: Iterable<string>, map: KeyMap): number {
  let held = 0;
  for (const code of keys) {
    const bit = map[code];
    if (bit !== undefined) held |= bit;
  }
  return held >>> 0;
}

export class KeyboardSource {
  private readonly keys = new Set<string>();
  private attached: EventTarget | null = null;

  private readonly onKeyDown = (e: Event): void => {
    const code = (e as KeyboardEvent).code;
    if (PREVENT_DEFAULT_CODES.has(code)) e.preventDefault();
    this.keys.add(code);
  };

  private readonly onKeyUp = (e: Event): void => {
    this.keys.delete((e as KeyboardEvent).code);
  };

  constructor(private readonly map: KeyMap) {}

  attach(target: EventTarget = window): void {
    this.detach();
    this.attached = target;
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.attached.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.attached = null;
    this.keys.clear();
  }

  /** 当前帧输入（World 会在下一帧把它和上一帧做差得到边沿） */
  get sample(): InputSample {
    return { held: heldFromKeys(this.keys, this.map) };
  }

  /** 失焦时清空，避免"按住方向键切窗回来还在走" */
  clear(): void {
    this.keys.clear();
  }
}
