/**
 * 连招演示：把"文字连段"翻译成逐帧按键，交给训练模式按帧喂进去。
 *
 * 为什么不做成"自动打 AI"：演示的目的是让人**看清指令怎么搓**，
 * 所以逐帧按键本身就是最有信息量的东西（方向先出、攻击后按，和真人手速一致）。
 * 也顺便复用了对局完全相同的输入通路——演出来的连段一定是真能打出来的。
 */
import { Btn } from '../core/input';

/** 一步：一段方向/按键过程 + 这一步在界面上叫什么 */
export interface DemoStep {
  /** 界面显示，例如 `↓↘→ + A（荒咬み）` */
  label: string;
  /** 逐帧按住的位（每帧一个） */
  frames: number[];
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
export function comboDemoFor(): DemoStep[] {
  return [
    {
      label: '① 站轻拳 → 站轻拳',
      frames: [...tap(Btn.A), ...tap(Btn.A)],
    },
    {
      label: '② 站轻拳 → 必杀（↓↘→ + A）',
      frames: [...tap(Btn.A), ...qcf(Btn.A)],
    },
    {
      label: '③ 蹲轻脚 → 必杀 → 超必杀',
      frames: [...tap(D | Btn.B), ...qcf(Btn.A), ...qcf(Btn.A | Btn.C)],
    },
  ];
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
