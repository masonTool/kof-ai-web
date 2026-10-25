/**
 * 连招演示：把"文字连段"翻译成逐帧按键，交给训练模式按帧喂进去。
 *
 * 为什么不做成"自动打 AI"：演示的目的是让人**看清指令怎么搓**，
 * 所以逐帧按键本身就是最有信息量的东西（方向先出、攻击后按，和真人手速一致）。
 * 也顺便复用了对局完全相同的输入通路——演出来的连段一定是真能打出来的。
 */
import { Btn } from '../core/input';
import type { CharDef, MoveDef } from '../data/schema';

/** 一步：一段方向/按键过程 + 这一步在界面上叫什么 */
export interface DemoStep {
  /** 界面显示，例如 `↓↘→ + A（荒咬み）` */
  label: string;
  /** 逐帧按住的位（每帧一个） */
  frames: number[];
  /** 这一步用到的招式 id（用来查真实伤害，查不到就算 0） */
  moves?: string[];
  /** 这一步的理论伤害（由招式数据求和，不是估的） */
  damage?: number;
}

const D = Btn.Down;
const R = Btn.Right;
const L = Btn.Left;

/** 单帧轻点：按下再松开（两帧），保证边沿被识别 */
function tap(bit: number): number[] {
  return [bit, 0];
}

/** 236 + 攻击：下 → 下右 → 右 → 右+攻击 */
function qcf(attack: number): number[] {
  return [D, D | R, R, R | attack, 0];
}

/** 623 + 攻击：右 → 下 → 下右 + 攻击（留给以后的升龙连段） */
export function dp(attack: number): number[] {
  return [R, D, D | R | attack, 0];
}

/** 214 + 攻击：下 → 下左 → 左 → 左+攻击（留给以后的旋风连段） */
export function qcb(attack: number): number[] {
  return [D, D | L, L, L | attack, 0];
}

/**
 * 三段预设连招：由浅入深（单招 → 取消 → 超必杀收尾），
 * 方向前缀固定朝右，实际演示时由对局按朝向处理。
 */
export function comboDemoFor(char?: CharDef): DemoStep[] {
  const steps: DemoStep[] = [
    {
      label: '① 站轻拳 → 站轻拳',
      frames: [...tap(Btn.A), ...tap(Btn.A)],
      moves: ['5A', '5A'],
    },
    {
      label: '② 站轻拳 → 必杀（↓↘→ + A）',
      frames: [...tap(Btn.A), ...qcf(Btn.A)],
      moves: ['5A', '236A'],
    },
    {
      label: '③ 蹲轻脚 → 必杀 → 超必杀',
      frames: [...tap(D | Btn.B), ...qcf(Btn.A), ...qcf(Btn.A | Btn.C)],
      moves: ['2B', '236A', '236236AC'],
    },
  ];
  if (!char) return steps;
  // 伤害直接查招式数据求和：演示里报的数字必须和真打出来的对得上，不能随手估
  for (const step of steps) {
    step.damage = (step.moves ?? []).reduce((sum, id) => {
      const mv = (char.moves as Record<string, MoveDef | undefined>)[id];
      return sum + (mv ? mv.hits.reduce((a, h) => a + h.damage, 0) : 0);
    }, 0);
  }
  return steps;
}

/** 一套连段：同一个角色可以有好几套，从入门到高伤 */
export interface ComboSet {
  id: string;
  /** 界面显示的名字，带难度标签 */
  name: string;
  steps: DemoStep[];
}

/**
 * 一个角色的多套连招。
 *
 * 为什么分三套而不是只留最好的一套：新手照着"蹲轻脚→必杀→超必杀"练不出来，
 * 得先有只用轻拳的两段；而熟练玩家要看上限。三档刚好覆盖"能打出来 / 打得顺 / 打得疼"。
 */
export function comboSets(char?: CharDef): ComboSet[] {
  const make = (steps: DemoStep[]): DemoStep[] => {
    if (!char) return steps;
    for (const step of steps) {
      step.damage = (step.moves ?? []).reduce((sum, id) => {
        const mv = (char.moves as Record<string, MoveDef | undefined>)[id];
        return sum + (mv ? mv.hits.reduce((a, h) => a + h.damage, 0) : 0);
      }, 0);
    }
    return steps;
  };

  return [
    {
      id: 'basic',
      name: '入门 · 轻拳两段',
      steps: make([
        { label: '站轻拳', frames: [...tap(Btn.A)], moves: ['5A'] },
        { label: '站轻拳 → 站重拳', frames: [...tap(Btn.A), ...tap(Btn.C)], moves: ['5A', '5C'] },
      ]),
    },
    {
      id: 'standard',
      name: '标准 · 轻拳接必杀',
      steps: make(comboDemoFor(char).slice(0, 2)),
    },
    {
      id: 'advanced',
      name: '高伤 · 必杀接超必杀',
      steps: make(comboDemoFor(char).slice(1, 3)),
    },
  ];
}

/** 一套连段的总伤害（只算查得到的招式） */
export function totalDamage(steps: readonly DemoStep[]): number {
  return steps.reduce((sum, s) => sum + (s.damage ?? 0), 0);
}

/** 把多步连成一串，返回总帧数与每步的起始帧（界面上高亮"正在打第几步"用） */
export function flattenSteps(steps: readonly DemoStep[]): { frames: number[]; starts: number[] } {
  const frames: number[] = [];
  const starts: number[] = [];
  for (const step of steps) {
    starts.push(frames.length);
    frames.push(...step.frames);
    frames.push(0, 0); // 步与步之间留两帧空档，免得边沿黏在一起
  }
  return { frames, starts };
}

/** 当前帧落在第几步（没有就返回 -1） */
export function stepAt(starts: readonly number[], frame: number): number {
  let found = -1;
  for (let i = 0; i < starts.length; i++) if (frame >= starts[i]!) found = i;
  return found;
}
