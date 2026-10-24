/**
 * 输入历史缓冲：指令识别要吃"过去 N 帧按了什么"。
 *
 * 为什么不让每个系统各自存一份：指令窗口、连打判定、AI 观测必须看同一段历史，
 * 否则同一帧在不同系统里含义不同（这类 bug 极难查）。
 */
import type { InputState } from '../core/input';

/** 60 帧 ≈ 1 秒，够覆盖蓄力（40 帧）之外的一切指令 */
export const DEFAULT_BUFFER_FRAMES = 60;

export class InputBuffer {
  private states: InputState[] = [];

  constructor(private readonly capacity: number = DEFAULT_BUFFER_FRAMES) {}

  push(state: InputState): void {
    this.states.push(state);
    if (this.states.length > this.capacity) this.states.shift();
  }

  get length(): number {
    return this.states.length;
  }

  /** 当前帧（缓冲为空时返回"什么都没按"） */
  current(): InputState {
    return this.states[this.states.length - 1] ?? { held: 0, pressed: 0, released: 0 };
  }

  /** 最近 n 帧的 held 掩码，**旧 → 新**（最后一帧是当前帧） */
  heldHistory(frames: number): number[] {
    const n = Math.min(frames, this.states.length);
    return this.states.slice(this.states.length - n).map((s) => s.held);
  }

  /** 最近 n 帧里有没有按下过这些键（含当前帧） */
  pressedWithin(bits: number, frames: number): boolean {
    const n = Math.min(frames, this.states.length);
    for (let i = this.states.length - n; i < this.states.length; i++) {
      if ((this.states[i]!.pressed & bits) === bits) return true;
    }
    return false;
  }

  clear(): void {
    this.states.length = 0;
  }
}
