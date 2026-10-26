/**
 * 训练模式：无限血/无限气、假人行为、判定框与帧数显示。
 *
 * 刻意做成**纯逻辑**（不碰 DOM）：这样"无限气是否真的满槽""假人是否真的在防"
 * 都能在 node 里断言，而不是靠肉眼盯着画面猜。
 */
import { CpuBrain, CPU_LEVELS, CPU_LEVEL_LABEL, type CpuLevel } from '../ai/cpu';
import { Btn, NO_INPUT, type InputSample } from '../core/input';
import type { Match } from '../game/match';
import { METER_MAX } from '../sim/constants';
import type { Ctx2D } from '../render/ctx';

export type DummyAction = 'cpu' | 'stand' | 'crouch' | 'jump' | 'guard' | 'guardLow' | 'human';

/**
 * 练习目标：决定"这一局练什么"，并联动假人行为与指导文案。
 *
 * 原来的训练场只有一堆开关（无限血/假人行为/判定框），玩家进去不知道从哪开始——
 * 目标是一条"引导线"：选了目标就知道该练什么、假人该怎么站、屏幕上该看什么提示。
 */
export type TrainingGoal = 'free' | 'move' | 'defense' | 'combo';

export const GOAL_ORDER: readonly TrainingGoal[] = ['free', 'move', 'defense', 'combo'];

export const GOAL_LABEL: Record<TrainingGoal, string> = {
  free: '自由练习',
  move: '练招式',
  defense: '练防守',
  combo: '练连段',
};

/** 每个目标的指导文案（显示在训练状态条下面那一行） */
export const GOAL_HINT: Record<TrainingGoal, string> = {
  free: '随便打：方向键移动，ABC 是拳脚，L 看招式表',
  move: '按 L 看招式表，照着指令放：236 + 拳、623 + 拳、214 + 腿',
  defense: '按住后退就是防御；试试蹲防（↓ + 后退）扛下段',
  combo: '先用轻攻击确认命中，再接必杀（轻拳 → 236 拳）',
};

/** 目标对应的假人行为：练招/连段让木桩站着，练防守让 CPU 主动进攻 */
export const GOAL_DUMMY: Record<TrainingGoal, DummyAction> = {
  free: 'cpu',
  move: 'stand',
  defense: 'cpu',
  combo: 'stand',
};

export const DUMMY_ORDER: readonly DummyAction[] = ['cpu', 'stand', 'guard', 'guardLow', 'crouch', 'jump', 'human'];

export interface TrainingSettings {
  /** 画判定框（红=受击、黄=判定、蓝=推挤） */
  showBoxes: boolean;
  /** 画帧数/状态/招式信息 */
  showFrameData: boolean;
  infiniteHp: boolean;
  infiniteMeter: boolean;
  /** KO 后自动满血重来（训练模式不该结束回合） */
  autoReset: boolean;
  /** 假人行为 */
  dummy: DummyAction;
  /** 假人是 cpu 时的难度 */
  cpuLevel: CpuLevel;
  /** P1 也交给 CPU（观战模式：两边自动打） */
  cpuP1: boolean;
  /** 练习目标（决定假人行为与指导文案） */
  goal: TrainingGoal;
  /** 无限时间（回合倒计时不递减） */
  infiniteTime: boolean;
}

/**
 * 默认是"能正常打完一场"：无限血/无限气/自动重开全关。
 * 想练连段再按 F3/F4 打开——默认开无限血的话，人是永远打不死的，看着就像"没在打"。
 */
export const DEFAULT_TRAINING: TrainingSettings = {
  showBoxes: false,
  showFrameData: false,
  infiniteHp: false,
  infiniteMeter: false,
  autoReset: false,
  dummy: 'cpu',
  cpuLevel: 'normal',
  cpuP1: false,
  goal: 'free',
  // 训练场默认不计时：练招式时被倒计时打断最烦
  infiniteTime: true,
};

/** 切换练习目标：顺手把假人摆成该有的样子（不用玩家自己再去翻一遍假人选项） */
export function applyGoal(settings: TrainingSettings, goal: TrainingGoal): TrainingSettings {
  return { ...settings, goal, dummy: GOAL_DUMMY[goal] };
}

/** 把按住的键翻译成给人看的符号（调试面板用） */
export function describeInput(held: number): string {
  const parts: string[] = [];
  if (held & Btn.Up) parts.push('↑');
  if (held & Btn.Down) parts.push('↓');
  if (held & Btn.Left) parts.push('←');
  if (held & Btn.Right) parts.push('→');
  if (held & Btn.A) parts.push('A');
  if (held & Btn.B) parts.push('B');
  if (held & Btn.C) parts.push('C');
  if (held & Btn.D) parts.push('D');
  if (held & Btn.Start) parts.push('START');
  return parts.length > 0 ? parts.join(' ') : '-';
}

export class TrainingSession {
  readonly settings: TrainingSettings;

  constructor(
    private readonly match: Match,
    settings: Partial<TrainingSettings> = {},
  ) {
    this.settings = { ...DEFAULT_TRAINING, ...settings };
  }

  toggle(key: 'showBoxes' | 'showFrameData' | 'infiniteHp' | 'infiniteMeter' | 'autoReset'): boolean {
    this.settings[key] = !this.settings[key];
    return this.settings[key];
  }

  /** 切换 CPU 难度（循环） */
  cycleCpuLevel(): CpuLevel {
    const idx = CPU_LEVELS.indexOf(this.settings.cpuLevel);
    this.settings.cpuLevel = CPU_LEVELS[(idx + 1) % CPU_LEVELS.length]!;
    this.cpu = null; // 换档要重建，否则旧的档位参数还留在实例里
    return this.settings.cpuLevel;
  }

  /** 切换假人行为（循环） */
  /** 切换练习目标（循环）：顺手把假人摆成该有的样子 */
  cycleGoal(): TrainingGoal {
    const idx = GOAL_ORDER.indexOf(this.settings.goal);
    const next = GOAL_ORDER[(idx + 1) % GOAL_ORDER.length]!;
    // settings 是 readonly 引用，只能改字段不能整体替换
    this.settings.goal = next;
    this.settings.dummy = GOAL_DUMMY[next];
    return next;
  }

  cycleDummy(): DummyAction {
    const idx = DUMMY_ORDER.indexOf(this.settings.dummy);
    this.settings.dummy = DUMMY_ORDER[(idx + 1) % DUMMY_ORDER.length]!;
    return this.settings.dummy;
  }

  /** 假人这一帧该按什么（'human' 时用玩家 2 的输入） */
  dummyInput(p2Input: InputSample = NO_INPUT): InputSample {
    switch (this.settings.dummy) {
      case 'cpu':
        return this.cpuInput();
      case 'crouch':
        return { held: Btn.Down };
      case 'jump':
        return { held: Btn.Up };
      case 'guard':
        // 假人是 P2，面朝左 → 后退方向是右
        return { held: Btn.Right };
      case 'guardLow':
        return { held: Btn.Right | Btn.Down };
      case 'human':
        return p2Input;
      default:
        return NO_INPUT;
    }
  }

  /** CPU 大脑（难度档位在 settings.cpuLevel，换档时重建） */
  private cpu: CpuBrain | null = null;

  private cpuInput(): InputSample {
    if (!this.cpu) this.cpu = new CpuBrain(this.match.p2, this.match.p1, this.settings.cpuLevel);
    return this.cpu.step();
  }

  /** 观战模式用的 P1 大脑（和 P2 各一个实例，共用同一档难度） */
  private cpuP1Brain: CpuBrain | null = null;

  private p1CpuInput(): InputSample {
    if (!this.cpuP1Brain) this.cpuP1Brain = new CpuBrain(this.match.p1, this.match.p2, this.settings.cpuLevel);
    return this.cpuP1Brain.step();
  }

  /** 上一帧真正喂进模拟层的输入（含 CPU/假人的输入），录制回放用 */
  lastInputs: [InputSample, InputSample] = [{ held: 0 }, { held: 0 }];

  /** 推进一帧（训练模式的所有"作弊"都在这层做，模拟层保持干净） */
  step(inputs: readonly [InputSample, InputSample]): void {
    if (this.settings.infiniteMeter) {
      this.match.p1.meter = METER_MAX;
      this.match.p2.meter = METER_MAX;
    }
    if (this.settings.infiniteHp) {
      this.match.p1.hp = this.match.p1.maxHp;
      this.match.p2.hp = this.match.p2.maxHp;
    }

    // 真正喂给模拟层的那一对输入（假人/CPU 的输入也算在内）——录制回放要用它，
    // 否则录到的是"键盘输入"，重演时 CPU 不在，状态就对不上。
    // 观战模式：P1 也由 CPU 打，键盘不再参与
    const p1 = this.settings.cpuP1 ? this.p1CpuInput() : inputs[0];
    const p2 = this.dummyInput(inputs[1]);
    this.lastInputs = [p1, p2];
    this.match.step([p1, p2]);

    if (this.settings.autoReset && (this.match.phase === 'roundEnd' || this.match.phase === 'over')) {
      this.match.softReset();
    }
  }

  /** 调试面板的文字行 */
  frameDataLines(): string[] {
    const lines: string[] = [];
    const fighters: [string, Match['p1']][] = [
      ['P1', this.match.p1],
      ['P2', this.match.p2],
    ];
    for (const [label, f] of fighters) {
      if (f.isAttacking && f.move) {
        const move = f.move;
        const windows = move.hits.map((h) => `${h.frames[0]}-${h.frames[1]}`).join(' / ');
        lines.push(`${label} ${move.name} ${f.moveFrame}/${move.total}F 判定 ${windows}`);
      } else {
        lines.push(`${label} ${f.state} ${f.stateFrame}F 血 ${f.hp} 气 ${Math.round(f.meter)}`);
      }
      lines.push(`   输入 ${describeInput(f.input.held)}`);
    }
    lines.push('A 轻拳 B 轻脚 C 重拳 D 重脚 · A+B 回避 · C+D 吹飞 · ABC MAX');
    lines.push(`假人 ${this.settings.dummy}${this.settings.dummy === 'cpu' ? `(${CPU_LEVEL_LABEL[this.settings.cpuLevel]})` : ''} · F1 判定框 ${onOff(this.settings.showBoxes)} · F2 帧数 ${onOff(this.settings.showFrameData)}`);
    lines.push(`F3 无限气 ${onOff(this.settings.infiniteMeter)} · F4 无限血 ${onOff(this.settings.infiniteHp)} · F5 假人 · R 重开`);
    return lines;
  }
}

function onOff(v: boolean): string {
  return v ? 'ON' : 'OFF';
}

/** 调试文字（画在屏幕左侧，避开 HUD 的血条与连击位） */
export function drawTrainingOverlay(ctx: Ctx2D, lines: readonly string[]): void {
  ctx.font = '6px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = 62;
  for (const line of lines) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(line, 7, y + 1);
    ctx.fillStyle = '#9ff0c8';
    ctx.fillText(line, 6, y);
    y += 8;
  }
}
