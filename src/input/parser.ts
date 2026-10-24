/**
 * 指令识别：把"最近若干帧按住的方向"翻译成必杀技指令是否成立。
 *
 * 约定：
 * - 方向一律按**朝向相对**解释（面朝右时按左 = 4，面朝左时按左 = 6），
 *   所以招式表里只写 `236` 这种"前下前"，不用为左右各写一份。
 * - 判定"是否成立"只看窗口内的历史，不看未来；按键必须**本帧按下**（边沿）。
 * - 序列匹配用"允许中间夹无关帧"的后缀匹配：2…3…6 都算数，但最后一击必须在
 *   `MOTION_TAIL` 帧内完成，否则"半小时前摇过一遍"也能放必杀。
 */
import { Btn, axisX, axisY, type InputState } from '../core/input';
import type { ButtonId, InputSpec, MotionId } from '../data/schema';
import { InputBuffer } from './buffer';

/** 一次指令允许跨多少帧 */
export const MOTION_WINDOW = 15;
/** 指令的最后一帧距离按键不得超过这么多帧 */
export const MOTION_TAIL = 4;
/** 蓄力需要按住的帧数（KOF97 约 40 帧） */
export const CHARGE_FRAMES = 40;

export const BUTTON_BITS: Record<ButtonId, number> = {
  A: Btn.A,
  B: Btn.B,
  C: Btn.C,
  D: Btn.D,
};

/** 方向 → 小键盘数字（朝向相对：6 = 前，4 = 后） */
export function numpadOf(held: number, facing: 1 | -1): number {
  const fx = axisX(held) * facing;
  const dy = axisY(held);
  if (dy === 1) return fx === 1 ? 3 : fx === -1 ? 1 : 2;
  if (dy === -1) return fx === 1 ? 9 : fx === -1 ? 7 : 8;
  return fx === 1 ? 6 : fx === -1 ? 4 : 5;
}

/** 需要"依次经过"的指令 */
const SEQUENCES: Partial<Record<MotionId, number[]>> = {
  '236': [2, 3, 6],
  '214': [2, 1, 4],
  '421': [4, 2, 1],
  '623': [6, 2, 3],
  '41236': [4, 1, 2, 3, 6],
  '63214': [6, 3, 2, 1, 4],
  '22': [2, 5, 2],
  '236236': [2, 3, 6, 2, 3, 6],
  '214214': [2, 1, 4, 2, 1, 4],
};

/** 需要"当前正按住"的方向（指令通常技用，如 3K） */
const EXACT_DIRECTIONS: Partial<Record<MotionId, number>> = {
  '6': 6,
  '4': 4,
  '2': 2,
  '8': 8,
  '3': 3,
  '1': 1,
};

export class ChargeTracker {
  back = 0;
  down = 0;
  /** 上一帧结束时的值：松开方向那一帧（就是出招那一帧）还要能用一次 */
  private lastBack = 0;
  private lastDown = 0;

  /** 每帧推一次（在 push 输入之后、判定之前） */
  update(held: number, facing: 1 | -1): void {
    const fx = axisX(held) * facing;
    const dy = axisY(held);
    this.lastBack = this.back;
    this.lastDown = this.down;
    this.back = fx === -1 ? this.back + 1 : 0;
    this.down = dy === 1 ? this.down + 1 : 0;
  }

  backFrames(): number {
    return Math.max(this.back, this.lastBack);
  }

  downFrames(): number {
    return Math.max(this.down, this.lastDown);
  }

  reset(): void {
    this.back = 0;
    this.down = 0;
    this.lastBack = 0;
    this.lastDown = 0;
  }
}

function dirsOf(history: readonly number[], facing: 1 | -1): number[] {
  const dirs: number[] = [];
  for (const held of history) dirs.push(numpadOf(held, facing));
  return dirs;
}

/** 序列是否**恰好结束**在 end 帧（允许中间夹别帧，但不允许乱序） */
function matchesEndingAt(dirs: readonly number[], seq: readonly number[], end: number): boolean {
  let idx = seq.length - 1;
  if (dirs[end] !== seq[idx]) return false;
  idx--;
  for (let i = end - 1; i >= 0 && idx >= 0; i--) {
    if (dirs[i] === seq[idx]) idx--;
  }
  return idx < 0;
}

/** 双击（前冲/后冲）：两次 6 之间要松开过 */
function matchesDoubleTap(dirs: readonly number[], dir: number): boolean {
  let last = -1;
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (dirs[i] !== dir) continue;
    if (last < 0) {
      last = i;
      continue;
    }
    // 两次之间必须断开过（有不是 dir 的帧）
    for (let j = last - 1; j > i; j--) {
      if (dirs[j] !== dir) return true;
    }
    last = i;
  }
  return false;
}

/** 判定一个指令（只看方向）是否成立 */
export function matchMotion(
  motion: MotionId,
  history: readonly number[],
  facing: 1 | -1,
  charge?: ChargeTracker,
  opts: { window?: number; tail?: number } = {},
): boolean {
  if (motion === 'none') return true;
  const window = opts.window ?? MOTION_WINDOW;
  const tail = opts.tail ?? MOTION_TAIL;

  const recent = history.slice(Math.max(0, history.length - window));
  if (recent.length === 0) return false;
  const dirs = dirsOf(recent, facing);
  const current = dirs[dirs.length - 1]!;

  const exact = EXACT_DIRECTIONS[motion];
  if (exact !== undefined) return current === exact;

  if (motion === 'doubleTapF') return matchesDoubleTap(dirs, 6);
  if (motion === 'doubleTapB') return matchesDoubleTap(dirs, 4);

  if (motion === 'chargeBack') {
    return (charge?.backFrames() ?? 0) >= CHARGE_FRAMES && (current === 6 || current === 9 || current === 3);
  }
  if (motion === 'chargeDown') {
    return (charge?.downFrames() ?? 0) >= CHARGE_FRAMES && (current === 8 || current === 7 || current === 9);
  }

  const seq = SEQUENCES[motion];
  if (!seq) return false;
  for (let end = dirs.length - 1; end >= 0 && dirs.length - 1 - end <= tail; end--) {
    if (matchesEndingAt(dirs, seq, end)) return true;
  }
  return false;
}

/**
 * 每个玩家一份：攒历史 + 蓄力计时 + 朝向，对外只暴露"这个指令成立吗"。
 */
export class CommandParser {
  readonly buffer: InputBuffer;
  readonly charge = new ChargeTracker();
  private facing: 1 | -1;

  constructor(facing: 1 | -1 = 1) {
    this.facing = facing;
    this.buffer = new InputBuffer();
  }

  setFacing(facing: 1 | -1): void {
    this.facing = facing;
  }

  /** 每帧先调这个（传入 World 算好边沿的那份输入） */
  push(state: InputState): void {
    this.buffer.push(state);
    this.charge.update(state.held, this.facing);
  }

  get current(): InputState {
    return this.buffer.current();
  }

  matchMotion(motion: MotionId, opts: { window?: number; tail?: number } = {}): boolean {
    return matchMotion(motion, this.buffer.heldHistory(opts.window ?? MOTION_WINDOW), this.facing, this.charge, opts);
  }

  /** 按键是否本帧按下（多键要求同帧，如 CD 攻击） */
  pressedButtons(buttons: readonly ButtonId[] = []): boolean {
    if (buttons.length === 0) return true;
    let mask = 0;
    for (const b of buttons) mask |= BUTTON_BITS[b];
    return (this.current.pressed & mask) === mask;
  }

  /** 一个 InputSpec 是否成立：按键 + 指令 */
  match(spec: InputSpec): boolean {
    if (!this.pressedButtons(spec.buttons)) return false;
    return this.matchMotion(spec.motion);
  }
}
