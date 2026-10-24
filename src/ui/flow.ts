/**
 * 流程状态机：标题 → 选人 → VS → 对战 → 结果 → 回标题。
 *
 * 纯逻辑（不碰 DOM/Canvas）：哪一屏、光标在哪、谁确定了、什么时候开打，
 * 全部能在这个类里断言；绘制在 `render/screens.ts`，接线在 `main.ts`。
 */
import { Btn, type InputSample } from '../core/input';
import type { CharDef } from '../data/schema';

export type ScreenId = 'title' | 'select' | 'vs' | 'fight' | 'result';

/** `step()` 返回给外层的动作 */
export type FlowAction = 'none' | 'start-match' | 'to-title';

/** 花名册越大列数越多（4/6/8），保证 320×224 里排得下 */
export function gridColumns(count: number): number {
  if (count <= 12) return 4;
  if (count <= 24) return 6;
  return 8;
}

export interface FlowConfig {
  /** VS 演出停留帧数 */
  vsFrames: number;
  /** 电脑选人时犹豫多久（帧） */
  cpuThinkFrames: number;
  /** 选人栅格每行几个；0 = 按人数自动算 */
  columns: number;
}

export const DEFAULT_FLOW: FlowConfig = {
  vsFrames: 90,
  cpuThinkFrames: 24,
  columns: 0,
};

export class AppFlow {
  screen: ScreenId = 'title';
  /** 光标（0 = P1，1 = P2/CPU） */
  cursor: [number, number] = [0, 1];
  /** 是否已经确定 */
  locked: [boolean, boolean] = [false, false];
  /** 当前屏已经停留的帧数 */
  timer = 0;
  /** 本场选定的角色（进入 VS 时固定下来） */
  picks: [CharDef, CharDef] | null = null;

  private cpuSeed = 0x51a7;
  private prevP1Pressed = 0;

  constructor(
    readonly roster: readonly CharDef[],
    readonly config: FlowConfig = DEFAULT_FLOW,
  ) {}

  get rosterSize(): number {
    return this.roster.length;
  }

  /** 当前栅格列数（配置里写死就用配置，否则按人数算） */
  get columns(): number {
    return this.config.columns > 0 ? this.config.columns : gridColumns(this.rosterSize);
  }

  /** 电脑的选择（确定性伪随机，测试里可复现） */
  private cpuRand(): number {
    this.cpuSeed = (this.cpuSeed * 1103515245 + 12345) & 0x7fffffff;
    return this.cpuSeed / 0x7fffffff;
  }

  step([p1In]: readonly [InputSample, InputSample], opts: { matchOver?: boolean } = {}): FlowAction {
    const pressed = this.pressedOf(p1In);
    const start = (pressed & (Btn.A | Btn.Start)) !== 0;
    const action: FlowAction = 'none';
    this.timer++;

    switch (this.screen) {
      case 'title':
        if (start) this.enterSelect();
        break;

      case 'select': {
        // P1：方向移动光标、A/C 确定、B/D 取消
        if (!this.locked[0]) {
          if ((pressed & Btn.Left) !== 0) this.moveCursor(0, -1);
          if ((pressed & Btn.Right) !== 0) this.moveCursor(0, 1);
          if ((pressed & Btn.Up) !== 0) this.moveCursor(0, -this.columns);
          if ((pressed & Btn.Down) !== 0) this.moveCursor(0, this.columns);
          if ((pressed & (Btn.A | Btn.C)) !== 0) this.locked[0] = true;
        } else if ((pressed & (Btn.B | Btn.D)) !== 0) {
          this.locked[0] = false;
        }
        // 电脑：犹豫若干帧后随机落在某人身上
        if (!this.locked[1] && this.timer > this.config.cpuThinkFrames) {
          this.cursor[1] = Math.floor(this.cpuRand() * this.rosterSize) % this.rosterSize;
          this.locked[1] = true;
        }
        if (this.locked[0] && this.locked[1]) {
          this.picks = [this.roster[this.cursor[0]]!, this.roster[this.cursor[1]]!];
          this.screen = 'vs';
          this.timer = 0;
        }
        break;
      }

      case 'vs':
        if (this.timer >= this.config.vsFrames) {
          this.screen = 'fight';
          this.timer = 0;
          return 'start-match';
        }
        break;

      case 'fight':
        if (opts.matchOver === true) {
          this.screen = 'result';
          this.timer = 0;
        }
        break;

      case 'result':
        if (this.timer > 30 && start) {
          this.reset(); // 回标题顺便把选人结果清掉
          return 'to-title';
        }
        break;
    }
    return action;
  }

  /** 输入里的"本帧按下"：InputSample 只有 held，这里靠前一帧差出边沿 */
  private pressedOf(sample: InputSample): number {
    const held = sample.held >>> 0;
    const pressed = (held & ~this.prevP1Pressed) >>> 0;
    this.prevP1Pressed = held;
    return pressed;
  }

  private moveCursor(who: 0 | 1, delta: number): void {
    const size = this.rosterSize;
    if (size === 0) return;
    this.cursor[who] = ((this.cursor[who] + delta) % size + size) % size;
  }

  private enterSelect(): void {
    this.screen = 'select';
    this.timer = 0;
    this.locked = [false, false];
    this.picks = null;
    this.cursor = [0, Math.min(1, this.rosterSize - 1)];
  }

  /** 回到标题时清状态（结果屏按 A 之后由 main 调用） */
  reset(): void {
    this.screen = 'title';
    this.timer = 0;
    this.locked = [false, false];
    this.picks = null;
  }
}
