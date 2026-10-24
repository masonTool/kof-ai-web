/**
 * 手柄输入源（Gamepad API）。
 *
 * 只做"读标准化状态 → 位掩码"这一件事；不处理死区之外的复杂逻辑。
 * `heldFromPad()` 是纯函数，测试里直接喂假手柄即可。
 */
import { Btn, type InputSample } from '../core/input';
import type { ButtonId } from '../data/schema';

/** 手柄的最小结构化形态（相当于 navigator.getGamepads() 的返回项） */
export interface PadState {
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

export interface PadMap {
  /** 左摇杆在 axes 里的下标 */
  axes: { x: number; y: number };
  /** A/B/C/D/Start 对应 buttons 下标 */
  buttons: Record<ButtonId | 'start', number>;
}

export const DEFAULT_PAD_MAP: PadMap = {
  axes: { x: 0, y: 1 },
  // 标准布局：0=下 1=右 2=左 3=上，4=LB 5=RB 6=LT 7=RT
  buttons: { A: 2, B: 0, C: 3, D: 1, start: 9 },
};

export const DEFAULT_DEADZONE = 0.4;

export function heldFromPad(pad: PadState, map: PadMap = DEFAULT_PAD_MAP, deadzone = DEFAULT_DEADZONE): number {
  let held = 0;

  const ax = pad.axes[map.axes.x] ?? 0;
  const ay = pad.axes[map.axes.y] ?? 0;
  if (ax <= -deadzone) held |= Btn.Left;
  if (ax >= deadzone) held |= Btn.Right;
  if (ay <= -deadzone) held |= Btn.Up;
  if (ay >= deadzone) held |= Btn.Down;

  const press = (index: number): boolean => pad.buttons[index]?.pressed === true;
  if (press(map.buttons.A)) held |= Btn.A;
  if (press(map.buttons.B)) held |= Btn.B;
  if (press(map.buttons.C)) held |= Btn.C;
  if (press(map.buttons.D)) held |= Btn.D;
  if (press(map.buttons.start)) held |= Btn.Start;

  return held >>> 0;
}

export class GamepadSource {
  constructor(
    private readonly index = 0,
    private readonly map: PadMap = DEFAULT_PAD_MAP,
  ) {}

  /** 手柄没插/没授权时返回空输入 */
  read(provider: () => readonly (PadState | null)[] = defaultProvider): InputSample {
    const pads = provider();
    const pad = pads[this.index] ?? null;
    if (!pad) return { held: 0 };
    return { held: heldFromPad(pad, this.map) };
  }
}

function defaultProvider(): readonly (PadState | null)[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return navigator.getGamepads();
}
