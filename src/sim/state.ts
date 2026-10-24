/**
 * 角色状态枚举与判定谓词。
 *
 * 为什么单独立一份：状态会出现在数据校验、渲染选动画、AI 判断、测试断言四处，
 * 散着写字符串迟早拼错；这里给唯一来源，且"这类状态能不能动"只有一个答案。
 */
export const FighterState = {
  Idle: 'idle',
  WalkF: 'walkF',
  WalkB: 'walkB',
  Crouch: 'crouch',
  Jump: 'jump',
  /** 出招中（含通常技/必杀技/超必杀） */
  Attack: 'attack',
  /** 空中招式落地后的硬直 */
  Landing: 'landing',
  /** 站/蹲防御（没有防御硬直时的主动防御姿） */
  Guard: 'guard',
  /** 受击硬直 */
  Hit: 'hit',
  /** 防御硬直 */
  Block: 'block',
  /** 倒地 */
  Down: 'down',
  /** 起身（无敌） */
  Wakeup: 'wakeup',
  /** 气绝 */
  Dizzy: 'dizzy',
  /** 特殊移动（回避翻滚等） */
  Roll: 'roll',
  Win: 'win',
  Lose: 'lose',
  Dead: 'dead',
} as const;

export type FighterState = (typeof FighterState)[keyof typeof FighterState];

const NEUTRAL: ReadonlySet<FighterState> = new Set([
  FighterState.Idle,
  FighterState.WalkF,
  FighterState.WalkB,
  FighterState.Crouch,
]);

/** 能不能主动行动（出招/跳跃/移动） */
export function canAct(state: FighterState): boolean {
  return NEUTRAL.has(state);
}

/** 正在挨打/被打倒：由命中结算驱动，玩家输入无效 */
export function isReactive(state: FighterState): boolean {
  return (
    state === FighterState.Hit ||
    state === FighterState.Block ||
    state === FighterState.Down ||
    state === FighterState.Wakeup ||
    state === FighterState.Dizzy
  );
}

/** 能动但受限制的"特殊动作" */
export function isBusy(state: FighterState): boolean {
  return (
    state === FighterState.Attack ||
    state === FighterState.Landing ||
    state === FighterState.Roll ||
    state === FighterState.Guard
  );
}

export function isNeutral(state: FighterState): boolean {
  return NEUTRAL.has(state);
}

export function isDead(state: FighterState): boolean {
  return state === FighterState.Dead;
}
