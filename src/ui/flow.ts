/**
 * 流程状态机：标题 → 模式 → 选人 → VS → 对战 →（续关）→ 结果 → 标题，另有一条选项支线。
 *
 * 纯逻辑（不碰 DOM/Canvas）：哪一屏、光标在哪、谁确定了、什么时候开打，
 * 全部能在这个类里断言；绘制在 `render/screens.ts`，接线在 `main.ts`。
 *
 * 三种模式共用同一条主干，只在两处分叉：
 * - **训练**：选完人直接开打（跳过 VS 演出），也不提供续关；
 * - **双人**：P2 由第二个输入源选人，CPU 不自动选；
 * - **街机**：P2 是 CPU，输掉时进续关倒计时。
 */
import { Btn, type InputSample } from '../core/input';
import type { CharDef } from '../data/schema';
import { SettingsStore, optionRows, type OptionKey } from './settings';

export type ScreenId =
  | 'title' | 'mode' | 'select' | 'vs' | 'fight' | 'result' | 'continue' | 'options' | 'keybind';

export type GameMode = 'arcade' | 'versus' | 'training';

/** `step()` 返回给外层的动作 */
export type FlowAction = 'none' | 'start-match' | 'to-title';

export const MODE_ITEMS: readonly { id: GameMode | 'options'; label: string }[] = [
  { id: 'arcade', label: '街机模式（单人）' },
  { id: 'versus', label: '双人对战' },
  { id: 'training', label: '训练模式' },
  { id: 'options', label: '选项' },
];

/** 花名册越大列数越多，保证 320×224 里排得下、名字还读得出来 */
export function gridColumns(count: number): number {
  if (count <= 12) return 4;
  if (count <= 20) return 5;
  if (count <= 30) return 6;
  return 8;
}

export interface FlowConfig {
  /** VS 演出停留帧数 */
  vsFrames: number;
  /** 电脑选人时犹豫多久（帧） */
  cpuThinkFrames: number;
  /** 选人栅格每行几个；0 = 按人数自动算 */
  columns: number;
  /** 续关倒计时（帧）；600 = 10 秒 */
  continueFrames: number;
  /** 结果屏停留多久才接受按键（防手滑） */
  resultLockFrames: number;
}

export const DEFAULT_FLOW: FlowConfig = {
  vsFrames: 90,
  cpuThinkFrames: 24,
  columns: 0,
  continueFrames: 600,
  resultLockFrames: 30,
};

export class AppFlow {
  screen: ScreenId = 'title';
  mode: GameMode = 'arcade';
  /** 模式选择光标 */
  modeCursor = 0;
  /** 选项屏光标 */
  optionCursor = 0;
  /** 选项屏是从哪儿进来的（决定返回去哪一屏） */
  optionsFrom: 'mode' | 'fight' = 'mode';
  /** 光标（0 = P1，1 = P2/CPU） */
  cursor: [number, number] = [0, 1];
  /** 是否已经确定 */
  locked: [boolean, boolean] = [false, false];
  /** 当前屏已经停留的帧数 */
  timer = 0;
  /** 本场选定的角色（进入 VS 时固定下来） */
  picks: [CharDef, CharDef] | null = null;
  /** 续关倒计时剩余帧 */
  continueLeft = 0;
  /** 已续关次数（街机模式） */
  continues = 0;

  readonly settings: SettingsStore;
  private cpuSeed = 0x51a7;
  private prevPressed: [number, number] = [0, 0];

  constructor(
    readonly roster: readonly CharDef[],
    readonly config: FlowConfig = DEFAULT_FLOW,
    settings: SettingsStore | null = null,
  ) {
    this.settings = settings ?? new SettingsStore(null);
  }

  get rosterSize(): number {
    return this.roster.length;
  }

  /** 当前栅格列数（配置里写死就用配置，否则按人数算） */
  get columns(): number {
    return this.config.columns > 0 ? this.config.columns : gridColumns(this.rosterSize);
  }

  /** 选项屏当前可显示的项（给绘制层） */
  get options() {
    return optionRows(this.settings.settings);
  }

  /** 选项屏的行数（末尾额外一条"按键设置 →"） */
  get optionCount(): number {
    return this.options.length + 1;
  }

  /** 光标是否停在"按键设置"那一行 */
  get onKeybindRow(): boolean {
    return this.optionCursor >= this.options.length;
  }

  /** 电脑的选择（确定性伪随机，测试里可复现） */
  private cpuRand(): number {
    this.cpuSeed = (this.cpuSeed * 1103515245 + 12345) & 0x7fffffff;
    return this.cpuSeed / 0x7fffffff;
  }

  step(
    inputs: readonly [InputSample, InputSample],
    opts: { matchOver?: boolean; matchWinner?: 0 | 1 | 2 } = {},
  ): FlowAction {
    const pressed = this.pressedOf(0, inputs[0]);
    const pressed2 = this.pressedOf(1, inputs[1]);
    const start = (pressed & (Btn.A | Btn.Start)) !== 0;
    this.timer++;

    switch (this.screen) {
      case 'title':
        if (start) {
          this.screen = 'mode';
          this.timer = 0;
        }
        break;

      case 'mode': {
        if ((pressed & Btn.Up) !== 0) this.modeCursor = this.wrap(this.modeCursor, -1, MODE_ITEMS.length);
        if ((pressed & Btn.Down) !== 0) this.modeCursor = this.wrap(this.modeCursor, 1, MODE_ITEMS.length);
        if ((pressed & (Btn.A | Btn.Start)) !== 0) {
          const item = MODE_ITEMS[this.modeCursor]!;
          if (item.id === 'options') {
            this.screen = 'options';
            this.timer = 0;
            this.optionCursor = 0;
          } else {
            this.mode = item.id;
            this.enterSelect();
          }
        }
        break;
      }

      case 'options': {
        const count = this.optionCount;
        if ((pressed & Btn.Up) !== 0) this.optionCursor = this.wrap(this.optionCursor, -1, count);
        if ((pressed & Btn.Down) !== 0) this.optionCursor = this.wrap(this.optionCursor, 1, count);
        const row = this.options[this.optionCursor];
        if (row) {
          const dir: 1 | -1 | 0 = (pressed & Btn.Right) !== 0 ? 1 : (pressed & Btn.Left) !== 0 ? -1 : 0;
          if (dir !== 0) this.settings.cycle(row.key as OptionKey, dir);
          if ((pressed & (Btn.A | Btn.C)) !== 0) this.settings.cycle(row.key as OptionKey, 1);
        } else if ((pressed & (Btn.A | Btn.C | Btn.Right)) !== 0) {
          // 最后一行是"按键设置 →"
          this.screen = 'keybind';
          this.timer = 0;
        }
        if ((pressed & (Btn.B | Btn.D)) !== 0) {
          this.screen = this.optionsFrom;
          this.timer = 0;
        }
        break;
      }

      case 'keybind':
        // 具体按键由外层（main）递给 KeyBindMenu，这里只处理"返回"
        if ((pressed & (Btn.B | Btn.D)) !== 0) {
          this.screen = 'options';
          this.timer = 0;
        }
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

        if (this.mode === 'versus') {
          // 双人：P2 自己选
          if (!this.locked[1]) {
            if ((pressed2 & Btn.Left) !== 0) this.moveCursor(1, -1);
            if ((pressed2 & Btn.Right) !== 0) this.moveCursor(1, 1);
            if ((pressed2 & Btn.Up) !== 0) this.moveCursor(1, -this.columns);
            if ((pressed2 & Btn.Down) !== 0) this.moveCursor(1, this.columns);
            if ((pressed2 & (Btn.A | Btn.C)) !== 0) this.locked[1] = true;
          } else if ((pressed2 & (Btn.B | Btn.D)) !== 0) {
            this.locked[1] = false;
          }
        } else if (!this.locked[1] && this.timer > this.config.cpuThinkFrames) {
          // 电脑：犹豫若干帧后随机落在某人身上
          this.cursor[1] = Math.floor(this.cpuRand() * this.rosterSize) % this.rosterSize;
          this.locked[1] = true;
        }

        if (this.locked[0] && this.locked[1]) {
          this.picks = [this.roster[this.cursor[0]]!, this.roster[this.cursor[1]]!];
          if (this.mode === 'training') {
            // 训练模式不演 VS，直接开打
            this.screen = 'fight';
            this.timer = 0;
            return 'start-match';
          }
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
          // 街机模式输给 CPU → 给一次续关机会
          if (this.mode === 'arcade' && opts.matchWinner === 2) {
            this.screen = 'continue';
            this.continueLeft = this.config.continueFrames;
          } else {
            this.screen = 'result';
          }
          this.timer = 0;
        }
        break;

      case 'continue':
        if (this.continueLeft > 0) this.continueLeft--;
        if (start) {
          this.continues++;
          this.screen = 'fight';
          this.timer = 0;
          return 'start-match'; // 用同一组 picks 重开，main 负责重建对局
        }
        if (this.continueLeft <= 0) {
          this.reset();
          return 'to-title';
        }
        break;

      case 'result':
        if (this.timer > this.config.resultLockFrames && start) {
          this.reset();
          return 'to-title';
        }
        break;
    }
    return 'none';
  }

  /** 输入里的"本帧按下"：InputSample 只有 held，这里靠前一帧差出边沿 */
  private pressedOf(who: 0 | 1, sample: InputSample): number {
    const held = sample.held >>> 0;
    const pressed = (held & ~this.prevPressed[who]) >>> 0;
    this.prevPressed[who] = held;
    return pressed;
  }

  private wrap(value: number, delta: number, size: number): number {
    if (size <= 0) return 0;
    return ((value + delta) % size + size) % size;
  }

  private moveCursor(who: 0 | 1, delta: number): void {
    this.cursor[who] = this.wrap(this.cursor[who], delta, this.rosterSize);
  }

  private enterSelect(): void {
    this.screen = 'select';
    this.timer = 0;
    this.locked = [false, false];
    this.picks = null;
    this.cursor = [0, Math.min(1, this.rosterSize - 1)];
  }

  /** 回到标题时清状态（结果屏/续关超时之后由外层调用） */
  reset(): void {
    this.screen = 'title';
    this.mode = 'arcade';
    this.modeCursor = 0;
    this.timer = 0;
    this.locked = [false, false];
    this.picks = null;
    this.continueLeft = 0;
    this.continues = 0;
  }
}
