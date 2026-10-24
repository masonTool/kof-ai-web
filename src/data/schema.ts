/**
 * 帧数据格式（唯一来源，渲染与模拟都只认这里的形状）。
 *
 * 坐标约定：相对角色**脚底中心**原点，x 向右；y **向下为正**，所以头顶是负 y。
 * 判定盒只写"面朝右"的形态，朝左时由 `Fighter.worldBox()` 镜像。
 */

/** 判定盒：左上角 + 宽高（相对脚底原点） */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 能防住的方式：high = 站防/蹲防都行，low = 必须蹲防，unblockable = 不能防 */
export type Guard = 'high' | 'low' | 'overhead' | 'unblockable';

/** 判定的视觉等级（决定受击动画与音效，防御规则看上面的 Guard） */
export type HitLevel = 'high' | 'mid' | 'low' | 'overhead';

export type Knockdown = 'none' | 'slam' | 'trip' | 'air';

/** 一次"命中事件"的定义：同一招式可以有多段（用不同 id 区分） */
export interface HitDef {
  /** 招式内唯一；同一段判定不会重复命中同一个目标 */
  id: string;
  box: Box;
  /** 判定生效帧区间（含端点，从招式第 0 帧算） */
  frames: [number, number];
  damage: number;
  /** 受击硬直帧 */
  hitStun: number;
  /** 防御硬直帧 */
  blockStun: number;
  /** 命中停顿帧（双方冻结） */
  hitstop: number;
  /** 防御条件 */
  guard: Guard;
  level: HitLevel;
  /** 命中后的水平击退（给对手） */
  pushback: number;
  /** 被防御时的水平击退 */
  blockPushback: number;
  /** 击飞初速（负 = 向上），0 = 不击飞 */
  launch?: number;
  knockdown?: Knockdown;
  /** 命中给攻击方加的气槽 */
  meterGain?: number;
  /** 命中音效 id（音频层解析） */
  sfx?: string;
}

export type ButtonId = 'A' | 'B' | 'C' | 'D';

/**
 * 指令类型（由 input/parser.ts 实现识别）。
 * 数字串 = 需要依次经过的方向（朝向相对：6 = 前，4 = 后）；
 * 单个数字 = "当前正按住该方向"（指令通常技用，如 3K）。
 */
export type MotionId =
  | 'none'
  | '236' | '214' | '421' | '623' | '41236' | '63214'
  | '236236' | '214214' | '2363214' | '22'
  | 'doubleTapF' | 'doubleTapB'
  | 'chargeBack' | 'chargeDown'
  | '6' | '4' | '2' | '8' | '3' | '1';

/** 必杀技的输入要求：motion（可选）+ 必须同帧按下的键 */
export interface InputSpec {
  motion: MotionId;
  /** 需要同时按下的键，例如 CD 攻击是 ['C','D']；投技是 ['C'] 或 ['D'] 但带近距离条件 */
  buttons?: ButtonId[];
}

export interface InvulnWindow {
  frames: [number, number];
  /** full = 全身无敌；air = 空中判定无敌；throw = 抓取无敌；low = 下段无敌 */
  kind: 'full' | 'air' | 'throw' | 'low';
}

/** 取消规则：能取消进哪些招式（key 是 moves 里的 id 或招式键） */
export interface CancelSpec {
  /** 命中时可取消进的招式 id */
  onHit?: string[];
  /** 被防御时可取消进的招式 id */
  onBlock?: string[];
  /** 允许取消的帧窗口（默认 = 判定生效帧起） */
  window?: [number, number];
}

export interface ProjectileDef {
  anim: string;
  /** 每帧水平速度（px），方向自动按朝向 */
  speed: number;
  hit: HitDef;
  /** 存活帧数；0 = 打到人或出屏才消失 */
  life: number;
  /** 在第几帧生成（默认 = 第一条判定的起始帧） */
  spawnFrame?: number;
  /** 生成位置（相对脚底原点，x 已按朝向镜像） */
  spawnOffsetX?: number;
  spawnOffsetY?: number;
}

/** 一个招式（通常技 / 必杀技 / 超必杀 / 特殊动作） */
export interface MoveDef {
  /** moves 里的 key，同时是取消表引用的 id */
  id: string;
  name: string;
  /** 渲染层姿势名（render/poses.ts 里的 key） */
  anim: string;
  /** 总帧数（含收招），必须 ≥ 所有判定的结束帧 */
  total: number;
  hits: HitDef[];
  input?: InputSpec;
  /** 消耗气槽 */
  meterCost?: number;
  invuln?: InvulnWindow[];
  cancel?: CancelSpec;
  /** 空中招式（不落地就不结束） */
  airborne?: boolean;
  /** 落地硬直帧（空中招式用） */
  landingLag?: number;
  projectile?: ProjectileDef;
  /** 是否可以被防御（投技为 false） */
  blockable?: boolean;
  /** 属于哪一类，UI/取消规则要用 */
  kind: 'normal' | 'command' | 'special' | 'super' | 'throw' | 'system';
  /** 整个招式期间的总位移（正数；方向由 facing 决定，如回避/突进） */
  travel?: number;
  /** 位移方向跟随输入（按住前=朝前、否则朝后），回避用 */
  travelFollowInput?: boolean;
  /** 位移在多少帧内走完（默认 = total） */
  travelFrames?: number;
}

export interface Palette {
  skin: string;
  hair: string;
  /** 上衣主色 */
  primary: string;
  /** 下装主色 */
  secondary: string;
  /** 描边/装饰 */
  trim: string;
  /** 高光 */
  accent: string;
}

/** 三种体型的受击盒（相对脚底原点） */
export interface HitBoxes {
  stand: Box;
  crouch: Box;
  air: Box;
}

export interface CharDef {
  id: string;
  name: string;
  palette: Palette;
  hp: number;
  /** 前进/后退速度（px/帧） */
  walk: { fwd: number; back: number };
  /**
   * 跳跃：初速（向上为负）+ 水平速度 + 滞空帧（用于动画）。
   * `smallVy/smallVx` 是**小跳**的数值（轻点↑），不写就按大跳的 62% / 85% 算。
   */
  jump: { vy: number; vx: number; frames: number; smallVy?: number; smallVx?: number };
  /** 受击盒（站/蹲/空三套） */
  boxes: HitBoxes;
  /** 推挤盒宽度（以角色 x 为中心）；不写就用默认 24 */
  push?: { w: number };
  /** 招式表，key 见 docs/ARCHITECTURE.md §6 */
  moves: Record<string, MoveDef>;
}

/**
 * 招式键名约定：
 * - 通常技：`5A 5B 5C 5D`（站）、`2A 2B 2C 2D`（蹲）、`jA jB jC jD`（空中）
 * - 指令通常技：方向前缀 + 键，如 `6B`、`3D`
 * - 系统技：`CD`（吹飞）、`AB`（回避）、`throw`（投技）
 * - 必杀/超必杀：指令串 + 键，如 `236A`、`623P`、`214K`、`236236P`、`236236AC`
 */
export const MOVE_KEY = /^(?:j?[1-9]?[ABCD]|CD|AB|throw|\d{2,8}(?:AC|[ABCDPK])(?:_\d)?)$/;

/** 校验一个招式数据是否自洽，返回问题列表（测试与启动时都能用） */
export function validateMove(move: MoveDef): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(move.total) || move.total <= 0) problems.push(`${move.id}: total 必须是正整数`);
  if (move.hits.length === 0 && move.kind !== 'system' && !move.projectile) {
    problems.push(`${move.id}: 没有判定盒（也没有飞行道具）`);
  }
  const seen = new Set<string>();
  for (const h of move.hits) {
    if (seen.has(h.id)) problems.push(`${move.id}: 判定 id 重复 ${h.id}`);
    seen.add(h.id);
    const [start, end] = h.frames;
    if (start < 0 || end < start) problems.push(`${move.id}/${h.id}: 判定帧区间非法 [${start},${end}]`);
    if (end >= move.total) problems.push(`${move.id}/${h.id}: 判定结束帧 ${end} ≥ total ${move.total}`);
    if (h.box.w <= 0 || h.box.h <= 0) problems.push(`${move.id}/${h.id}: 判定盒尺寸必须为正`);
    if (h.damage < 0) problems.push(`${move.id}/${h.id}: 伤害不能为负`);
  }
  const cancel = move.cancel;
  if (cancel?.window) {
    const [cs, ce] = cancel.window;
    if (cs < 0 || ce < cs) problems.push(`${move.id}: 取消窗口非法 [${cs},${ce}]`);
  }
  return problems;
}

/** 校验整张角色表：招式自洽 + 取消表引用存在 */
export function validateChar(char: CharDef): string[] {
  const problems: string[] = [];
  if (char.hp <= 0) problems.push(`${char.id}: hp 必须为正`);
  if (char.walk.fwd <= 0 || char.walk.back <= 0) problems.push(`${char.id}: 行走速度必须为正`);
  if (char.push && char.push.w <= 0) problems.push(`${char.id}: 推挤盒宽度必须为正`);
  for (const key of Object.keys(char.moves)) {
    const move = char.moves[key]!;
    if (!MOVE_KEY.test(key)) problems.push(`${char.id}: 招式键名 "${key}" 不符合约定（见 schema.ts 的 MOVE_KEY）`);
    if (move.id !== key) problems.push(`${char.id}: moves["${key}"].id 与键名不一致（${move.id}）`);
    problems.push(...validateMove(move).map((p) => `${char.id}/${p}`));
    for (const ref of [...(move.cancel?.onHit ?? []), ...(move.cancel?.onBlock ?? [])]) {
      if (!char.moves[ref]) problems.push(`${char.id}/${key}: 取消表引用了不存在的招式 ${ref}`);
    }
  }
  return problems;
}
