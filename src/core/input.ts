/**
 * 模拟层看到的输入形态。
 *
 * 键盘 / 手柄 / 触屏 / AI 都先归一化成 `InputSample`（只有位掩码），
 * 边沿（pressed / released）由 `World` 统一计算——这样"按下的那一帧"只有一个定义，
 * 回放与 AI 不会因为各自算边沿而错开一帧。
 */
export const Btn = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  A: 1 << 4, // 轻拳
  B: 1 << 5, // 轻脚
  C: 1 << 6, // 重拳
  D: 1 << 7, // 重脚
  Start: 1 << 8,
} as const;

export type BtnBit = (typeof Btn)[keyof typeof Btn];

/** 一帧的原始输入（按住哪些键） */
export interface InputSample {
  held: number;
}

/** 世界传给实体的输入（带边沿） */
export interface InputState {
  held: number;
  pressed: number;
  released: number;
}

export const NO_INPUT: InputSample = { held: 0 };

export function makeInput(held: number): InputSample {
  return { held: held >>> 0 };
}

export function edges(held: number, prev: number): InputState {
  return { held, pressed: held & ~prev, released: prev & ~held };
}

export function isDown(state: InputState | InputSample, bits: number): boolean {
  return (state.held & bits) === bits;
}

/** 水平方向（-1 左 / 0 / 1 右）；左右同时按视为中立（KOF 的抵消规则） */
export function axisX(held: number): -1 | 0 | 1 {
  const l = (held & Btn.Left) !== 0;
  const r = (held & Btn.Right) !== 0;
  if (l === r) return 0;
  return l ? -1 : 1;
}

/** 垂直方向（-1 上 / 0 / 1 下） */
export function axisY(held: number): -1 | 0 | 1 {
  const u = (held & Btn.Up) !== 0;
  const d = (held & Btn.Down) !== 0;
  if (u === d) return 0;
  return u ? -1 : 1;
}
