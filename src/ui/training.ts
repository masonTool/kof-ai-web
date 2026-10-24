/**
 * 训练模式：无限血/无限气、假人行为、判定框与帧数显示。
 *
 * 刻意做成**纯逻辑**（不碰 DOM）：这样"无限气是否真的满槽""假人是否真的在防"
 * 都能在 node 里断言，而不是靠肉眼盯着画面猜。
 */
import { Btn, NO_INPUT, type InputSample } from '../core/input';
import { FighterState } from '../sim/state';
import type { Match } from '../game/match';
import { METER_MAX } from '../sim/constants';
import type { Ctx2D } from '../render/ctx';

export type DummyAction = 'cpu' | 'stand' | 'crouch' | 'jump' | 'guard' | 'guardLow' | 'human';

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
};

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

  /** 切换假人行为（循环） */
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

  /** 简易 CPU 用的状态（确定性伪随机，不碰世界 rng） */
  private cpuPlan: { held: number; frames: number } = { held: 0, frames: 0 };
  private cpuSeed = 0x2f6e;

  private rand(): number {
    this.cpuSeed = (this.cpuSeed * 1103515245 + 12345) & 0x7fffffff;
    return this.cpuSeed / 0x7fffffff;
  }

  /**
   * 简易 CPU：走近 → 近身出招 → 看到对手出招就防。
   * 这不是正式 AI（T12 会做成难度档位），只为了"单人也能打一局"。
   */
  private cpuInput(): InputSample {
    const m = this.match;
    const me = m.p2;
    const foe = m.p1;
    if (m.phase !== 'fight' || me.state === FighterState.Dead) return NO_INPUT;

    if (this.cpuPlan.frames > 0) {
      this.cpuPlan.frames--;
      return { held: this.cpuPlan.held };
    }

    const dist = Math.abs(foe.x - me.x);
    const toward = foe.x >= me.x ? Btn.Right : Btn.Left;
    const back = me.facing === 1 ? Btn.Left : Btn.Right;

    // 对手在出招且够得着 → 有一半机会防（蹲防/站防都试试）
    if (foe.isAttacking && dist < 84 && this.rand() < 0.55) {
      const held = back | (this.rand() < 0.35 ? Btn.Down : 0);
      this.cpuPlan = { held, frames: 10 };
      return { held };
    }

    // 通常技最远够到约 46px，再远打就是挥空
    if (dist > 44) {
      this.cpuPlan = { held: toward, frames: 8 + Math.floor(this.rand() * 8) };
      return { held: this.cpuPlan.held };
    }

    // 近身出招：一帧按下算一次攻击，然后留出收招间隔
    const roll = this.rand();
    const button = roll < 0.45 ? Btn.B : roll < 0.8 ? Btn.C : Btn.A;
    const held = button | (this.rand() < 0.25 ? Btn.Down : 0);
    this.cpuPlan = { held: 0, frames: 10 + Math.floor(this.rand() * 12) };
    return { held };
  }

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

    this.match.step([inputs[0], this.dummyInput(inputs[1])]);

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
    lines.push(`假人 ${this.settings.dummy} · F1 判定框 ${onOff(this.settings.showBoxes)} · F2 帧数 ${onOff(this.settings.showFrameData)}`);
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
