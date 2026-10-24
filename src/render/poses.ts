/**
 * 程序化角色姿势库。
 *
 * 一个角色 = 一套骨架关键姿势 + 一份色板（`Palette`）。这样：
 * - 加角色只加色板与数据，不用画贴图（版权与工作量双赢）；
 * - 招式数据只引用 anim 名字，姿势怎么变是渲染层的事；
 * - 姿势是**纯数据**，能在 node 里断言"每个 anim 都有帧、帧都有合法数字"。
 *
 * 坐标系：与角色数据一致——原点在脚底中心，y 向下为负（头顶是负 y）。
 * 所有姿势只写"面朝右"的形态，朝左由绘制层 `scale(-1, 1)` 镜像。
 */
export type Point = readonly [x: number, y: number];

/** 一帧的关键点 */
export interface PoseFrame {
  head: Point;
  neck: Point;
  hip: Point;
  /** 后侧手臂：[肘, 手] */
  armBack: readonly [Point, Point];
  /** 前侧手臂：[肘, 手] */
  armFront: readonly [Point, Point];
  /** 后腿：[膝, 脚] */
  legBack: readonly [Point, Point];
  /** 前腿：[膝, 脚] */
  legFront: readonly [Point, Point];
}

export interface Pose {
  /** 每帧停留几帧（攻击动作 = 1，待机 = 6~8） */
  frameDuration: number;
  /** 循环播放（待机/走/晕眩）还是停在最后一帧（出招/受击） */
  loop: boolean;
  frames: PoseFrame[];
}

const p = (x: number, y: number): Point => [x, y];

/** 基本站架：双脚分开、重心居中、双手抬起 */
const BASE: PoseFrame = {
  head: p(2, -72),
  neck: p(1, -62),
  hip: p(0, -40),
  armBack: [p(-6, -54), p(-9, -46)],
  armFront: [p(7, -54), p(12, -46)],
  legBack: [p(-4, -22), p(-9, -1)],
  legFront: [p(5, -22), p(10, -1)],
};

/** 在基本站架基础上覆盖若干关键点 */
function f(over: Partial<PoseFrame> = {}): PoseFrame {
  return { ...BASE, ...over };
}

function bob(dy: number, lean = 0): PoseFrame {
  return f({
    head: p(2 + lean, -72 + dy),
    neck: p(1 + lean, -62 + dy),
    hip: p(0, -40 + dy),
    armBack: [p(-6, -54 + dy), p(-9, -46 + dy)],
    armFront: [p(7, -54 + dy), p(12, -46 + dy)],
  });
}

/** 走/退共用的腿部循环：4 帧一个步态 */
function stride(dy: number, lean: number, phase: number): PoseFrame {
  const legs: readonly [PoseFrame['legBack'], PoseFrame['legFront']][] = [
    [ [p(-6, -22), p(-14, -1)], [p(6, -22), p(12, -1)] ],
    [ [p(-3, -22), p(-6, -1)], [p(4, -22), p(6, -1)] ],
    [ [p(-8, -22), p(-10, -1)], [p(8, -22), p(16, -1)] ],
    [ [p(-4, -22), p(-4, -1)], [p(2, -22), p(2, -1)] ],
  ];
  const [legBack, legFront] = legs[phase % legs.length]!;
  const base = bob(dy, lean);
  return { ...base, legBack, legFront };
}

/** 出拳：起手 → 伸拳 → 收拳 */
function punch(reach: number, dy: number, torsoLean: number): PoseFrame[] {
  return [
    f({
      head: p(2 - 2, -72 + dy),
      neck: p(1 - 1, -62 + dy),
      armFront: [p(2, -56 + dy), p(4, -50 + dy)],
      armBack: [p(-8, -52 + dy), p(-12, -48 + dy)],
    }),
    f({
      head: p(2 + torsoLean, -72 + dy),
      neck: p(1 + torsoLean, -62 + dy),
      hip: p(torsoLean * 0.5, -40 + dy),
      armFront: [p(6 + reach * 0.4, -58 + dy), p(8 + reach, -56 + dy)],
      armBack: [p(-8, -54 + dy), p(-14, -52 + dy)],
    }),
    f({
      head: p(2 + torsoLean, -72 + dy),
      neck: p(1 + torsoLean, -62 + dy),
      armFront: [p(4 + reach * 0.4, -58 + dy), p(6 + reach, -56 + dy)],
      armBack: [p(-8, -54 + dy), p(-13, -50 + dy)],
    }),
  ];
}

/** 踢腿：起手 → 抬腿踢出 → 收腿 */
function kick(reach: number, height: number, dy: number): PoseFrame[] {
  return [
    f({
      hip: p(-2, -38 + dy),
      head: p(0, -70 + dy),
      neck: p(-1, -60 + dy),
      legFront: [p(6, -26), p(8, -2)],
    }),
    f({
      hip: p(-3, -38 + dy),
      head: p(-3, -68 + dy),
      neck: p(-4, -58 + dy),
      legFront: [p(10, -28 - height * 0.5), p(6 + reach, -30 - height)],
      legBack: [p(-4, -20), p(-10, -1)],
      armBack: [p(-10, -52), p(-16, -48)],
    }),
    f({
      hip: p(-2, -38 + dy),
      head: p(-1, -70 + dy),
      neck: p(-2, -60 + dy),
      legFront: [p(8, -26), p(10, -14)],
    }),
  ];
}

/** 蹲姿基础 */
const CROUCH: PoseFrame = {
  head: p(4, -54),
  neck: p(3, -46),
  hip: p(-2, -26),
  armBack: [p(-6, -40), p(-10, -32)],
  armFront: [p(8, -40), p(13, -34)],
  legBack: [p(-10, -14), p(-8, -1)],
  legFront: [p(8, -14), p(10, -1)],
};

export const POSE_LIBRARY: Record<string, Pose> = {
  idle: {
    frameDuration: 7,
    loop: true,
    frames: [bob(0), bob(-1), bob(0), bob(1)],
  },
  walkF: {
    frameDuration: 5,
    loop: true,
    frames: [stride(0, 1, 0), stride(-1, 2, 1), stride(0, 1, 2), stride(-1, 2, 3)],
  },
  walkB: {
    frameDuration: 6,
    loop: true,
    frames: [stride(0, -1, 1), stride(-1, -2, 0), stride(0, -1, 3), stride(-1, -2, 2)],
  },
  crouch: { frameDuration: 8, loop: false, frames: [CROUCH] },
  jump: {
    frameDuration: 5,
    loop: true,
    frames: [
      f({
        head: p(2, -70),
        neck: p(1, -60),
        hip: p(0, -38),
        legBack: [p(-6, -24), p(-10, -10)],
        legFront: [p(7, -24), p(12, -12)],
        armBack: [p(-10, -62), p(-14, -70)],
        armFront: [p(8, -62), p(13, -70)],
      }),
      f({
        head: p(2, -72),
        legBack: [p(-4, -20), p(-8, -12)],
        legFront: [p(6, -20), p(9, -14)],
      }),
    ],
  },
  landing: {
    frameDuration: 3,
    loop: false,
    frames: [
      f({
        head: p(3, -60),
        neck: p(2, -50),
        hip: p(-2, -30),
        legBack: [p(-10, -16), p(-9, -1)],
        legFront: [p(9, -16), p(11, -1)],
        armBack: [p(-8, -44), p(-14, -38)],
        armFront: [p(8, -44), p(14, -38)],
      }),
    ],
  },
  guard: {
    frameDuration: 6,
    loop: false,
    frames: [
      f({
        head: p(-1, -71),
        neck: p(-2, -61),
        armFront: [p(4, -58), p(0, -56)],
        armBack: [p(-2, -56), p(2, -54)],
        legBack: [p(-6, -22), p(-12, -1)],
      }),
    ],
  },
  block: {
    frameDuration: 4,
    loop: false,
    frames: [
      f({
        head: p(-3, -70),
        neck: p(-4, -60),
        armFront: [p(2, -58), p(-2, -58)],
        armBack: [p(-3, -56), p(1, -54)],
      }),
    ],
  },
  hit: {
    frameDuration: 3,
    loop: false,
    frames: [
      f({
        head: p(-4, -70),
        neck: p(-5, -60),
        hip: p(-2, -40),
        armFront: [p(2, -60), p(0, -70)],
        armBack: [p(-10, -58), p(-14, -64)],
        legBack: [p(-8, -22), p(-14, -2)],
      }),
      f({
        head: p(-6, -68),
        neck: p(-7, -58),
        hip: p(-3, -39),
        armFront: [p(0, -58), p(-4, -66)],
        armBack: [p(-12, -56), p(-16, -60)],
      }),
    ],
  },
  down: {
    frameDuration: 4,
    loop: false,
    frames: [
      {
        head: p(-18, -12),
        neck: p(-10, -10),
        hip: p(4, -8),
        armBack: [p(-14, -6), p(-20, -4)],
        armFront: [p(-6, -4), p(-2, -2)],
        legBack: [p(12, -6), p(20, -2)],
        legFront: [p(10, -10), p(18, -8)],
      },
    ],
  },
  wakeup: {
    frameDuration: 4,
    loop: false,
    frames: [
      {
        head: p(2, -52),
        neck: p(1, -44),
        hip: p(-4, -26),
        armBack: [p(-8, -34), p(-12, -26)],
        armFront: [p(6, -34), p(10, -26)],
        legBack: [p(-10, -14), p(-8, -1)],
        legFront: [p(8, -14), p(12, -1)],
      },
    ],
  },
  dizzy: {
    frameDuration: 8,
    loop: true,
    frames: [
      f({ head: p(0, -70), neck: p(0, -60), armFront: [p(9, -50), p(11, -40)], armBack: [p(-9, -50), p(-11, -40)] }),
      f({ head: p(4, -71), neck: p(3, -61), armFront: [p(11, -52), p(13, -42)], armBack: [p(-11, -52), p(-13, -42)] }),
    ],
  },
  roll: {
    frameDuration: 3,
    loop: false,
    frames: [
      f({ head: p(2, -50), neck: p(1, -42), hip: p(-2, -24), legFront: [p(8, -16), p(12, -4)] }),
      {
        head: p(-2, -22),
        neck: p(4, -20),
        hip: p(10, -14),
        armBack: [p(0, -14), p(-6, -8)],
        armFront: [p(8, -12), p(14, -8)],
        legBack: [p(16, -10), p(20, -2)],
        legFront: [p(14, -18), p(18, -14)],
      },
      f({ head: p(2, -60), neck: p(1, -52), hip: p(-2, -30), legFront: [p(8, -18), p(12, -2)] }),
    ],
  },
  punchLight: { frameDuration: 1, loop: false, frames: punch(16, 0, 1) },
  punchHeavy: { frameDuration: 1, loop: false, frames: punch(24, -1, 3) },
  kickLight: { frameDuration: 1, loop: false, frames: kick(18, 26, 0) },
  kickHeavy: { frameDuration: 1, loop: false, frames: kick(28, 34, -2) },
  crouchPunch: {
    frameDuration: 1,
    loop: false,
    frames: [
      { ...CROUCH, armFront: [p(6, -42), p(8, -38)] },
      { ...CROUCH, armFront: [p(12, -40), p(22, -34)] },
      { ...CROUCH, armFront: [p(9, -40), p(16, -36)] },
    ],
  },
  crouchKick: {
    frameDuration: 1,
    loop: false,
    frames: [
      { ...CROUCH, legFront: [p(10, -12), p(16, -6)] },
      { ...CROUCH, legFront: [p(16, -10), p(32, -4)] },
      { ...CROUCH, legFront: [p(12, -12), p(20, -6)] },
    ],
  },
  jumpAttack: {
    frameDuration: 1,
    loop: false,
    frames: [
      f({ head: p(2, -70), legBack: [p(-6, -24), p(-10, -12)], legFront: [p(7, -24), p(12, -14)], armFront: [p(4, -60), p(2, -68)] }),
      f({ head: p(4, -70), armFront: [p(10, -58), p(22, -52)], legFront: [p(10, -22), p(16, -16)] }),
      f({ head: p(4, -70), armFront: [p(8, -58), p(18, -54)], legFront: [p(8, -22), p(14, -16)] }),
    ],
  },
  special: {
    frameDuration: 1,
    loop: false,
    frames: [
      f({ head: p(-2, -70), neck: p(-3, -60), armBack: [p(-10, -66), p(-14, -72)], armFront: [p(2, -60), p(0, -68)] }),
      f({ head: p(3, -70), neck: p(2, -60), hip: p(2, -39), armFront: [p(10, -60), p(24, -58)], armBack: [p(-10, -50), p(-16, -46)] }),
      f({ head: p(3, -70), neck: p(2, -60), armFront: [p(8, -60), p(20, -58)] }),
    ],
  },
  throwStart: {
    frameDuration: 1,
    loop: false,
    frames: [
      f({ armFront: [p(8, -58), p(14, -56)], armBack: [p(-4, -56), p(2, -54)] }),
      f({ head: p(4, -70), armFront: [p(10, -60), p(20, -52)], armBack: [p(0, -56), p(6, -50)] }),
      f({ head: p(2, -70), armFront: [p(6, -56), p(12, -58)] }),
    ],
  },
  attack: { frameDuration: 1, loop: false, frames: punch(18, 0, 2) },
  hitFall: {
    frameDuration: 2,
    loop: false,
    frames: [
      f({ head: p(-8, -66), neck: p(-9, -56), armFront: [p(-2, -56), p(-8, -62)], armBack: [p(-14, -52), p(-20, -56)] }),
      f({ head: p(-14, -60), neck: p(-15, -50), armFront: [p(-8, -50), p(-14, -54)], armBack: [p(-20, -46), p(-26, -50)] }),
    ],
  },
  // 登场挑衅：抬手勾指，给对方一个"来吧"
  taunt: {
    frameDuration: 8,
    loop: true,
    frames: [
      f({ head: p(3, -70), armFront: [p(9, -66), p(14, -78)], armBack: [p(-7, -56), p(-10, -48)] }),
      f({ head: p(3, -71), armFront: [p(9, -68), p(13, -76)], armBack: [p(-7, -54), p(-10, -46)] }),
    ],
  },
  win: {
    frameDuration: 10,
    loop: true,
    frames: [
      f({ head: p(2, -70), armFront: [p(10, -66), p(16, -76)], armBack: [p(-8, -56), p(-12, -48)] }),
      f({ head: p(2, -70), armFront: [p(10, -68), p(16, -78)], armBack: [p(-8, -54), p(-12, -46)] }),
    ],
  },
  // 胜利变体 2：双臂上举
  win2: {
    frameDuration: 10,
    loop: true,
    frames: [
      f({ head: p(0, -72), armFront: [p(9, -70), p(13, -82)], armBack: [p(-9, -70), p(-13, -82)], legFront: [p(6, -22), p(11, -1)] }),
      f({ head: p(0, -73), armFront: [p(9, -72), p(12, -84)], armBack: [p(-9, -72), p(-12, -84)], legFront: [p(6, -22), p(11, -1)] }),
    ],
  },
  // 胜利变体 3：抱臂点头
  win3: {
    frameDuration: 12,
    loop: true,
    frames: [
      f({ head: p(2, -70), armFront: [p(7, -58), p(-2, -62)], armBack: [p(-7, -58), p(2, -60)], legBack: [p(-5, -22), p(-10, -1)] }),
      f({ head: p(2, -71), armFront: [p(7, -59), p(-2, -63)], armBack: [p(-7, -59), p(2, -61)], legBack: [p(-5, -22), p(-10, -1)] }),
    ],
  },
  lose: {
    frameDuration: 10,
    loop: false,
    frames: [
      f({ head: p(-2, -60), neck: p(-1, -50), hip: p(-2, -32), armFront: [p(6, -44), p(10, -36)], armBack: [p(-8, -44), p(-12, -36)] }),
    ],
  },
};

/** 状态 → 默认动画名（攻击类由招式数据覆盖） */
export const STATE_ANIM: Record<string, string> = {
  idle: 'idle',
  walkF: 'walkF',
  walkB: 'walkB',
  crouch: 'crouch',
  jump: 'jump',
  attack: 'attack',
  landing: 'landing',
  guard: 'guard',
  hit: 'hit',
  block: 'block',
  down: 'down',
  wakeup: 'wakeup',
  dizzy: 'dizzy',
  roll: 'roll',
  win: 'win',
  lose: 'lose',
  dead: 'down',
};

export function hasPose(anim: string): boolean {
  return Object.prototype.hasOwnProperty.call(POSE_LIBRARY, anim);
}

export function poseNames(): string[] {
  return Object.keys(POSE_LIBRARY);
}

/**
 * 取某个动画在第 elapsed 帧该显示哪一帧姿势。
 *
 * - 循环动画（待机/走）：按 `frameDuration` 走，到尾回绕；
 * - 定格动画（出招/受击）：不传 `duration` 时按 `frameDuration` 播到最后一帧就停；
 *   传了 `duration`（招式的总帧数）就把关键帧**按比例铺满整个招式**——
 *   否则 24 帧的重拳会在一帧内伸完，剩下 23 帧都在摆同一个姿势。
 */
/**
 * 招式表引用的 anim 必须都存在于姿势库。
 * 姿势帧与招式总帧**解耦**（关键帧按 `duration` 比例铺开，末尾定格），
 * 所以这里只校验"名字存在"，不要求帧数等于招式帧数。
 */
export function validateCharPoses(char: { id: string; moves: Record<string, { anim: string }> }): string[] {
  const problems: string[] = [];
  for (const [key, move] of Object.entries(char.moves)) {
    if (!hasPose(move.anim)) problems.push(`${char.id}/${key}: 姿势库里没有 ${move.anim}`);
  }
  return problems;
}

/** 当前该显示第几帧（贴图管线要按同一个下标取图，不能各算一套） */
export function poseFrameIndex(anim: string, elapsed: number, duration?: number): number {
  const pose = hasPose(anim) ? POSE_LIBRARY[anim]! : POSE_LIBRARY['idle']!;
  const span = duration !== undefined && duration > 0 ? duration / pose.frames.length : Math.max(1, pose.frameDuration);
  const idx = Math.floor(Math.max(0, elapsed) / span);
  return pose.loop ? idx % pose.frames.length : Math.min(idx, pose.frames.length - 1);
}

export function resolvePose(anim: string, elapsed: number, duration?: number): PoseFrame {
  const pose = hasPose(anim) ? POSE_LIBRARY[anim]! : POSE_LIBRARY['idle']!;
  const span = duration !== undefined && duration > 0 ? duration / pose.frames.length : Math.max(1, pose.frameDuration);
  const idx = Math.floor(Math.max(0, elapsed) / span);
  const frame = pose.loop ? idx % pose.frames.length : Math.min(idx, pose.frames.length - 1);
  return pose.frames[frame]!;
}

/**
 * 每个角色用哪个胜利姿势：按 id 的字符和取模，**确定性**且不用随机的感觉。
 * 光靠台词区分还不够——29 个人摆同一个姿势太寡淡。
 */
const WIN_VARIANTS = ['win', 'win2', 'win3'] as const;
export type WinPose = (typeof WIN_VARIANTS)[number];

export function winPoseFor(charId: string): WinPose {
  let sum = 0;
  for (let i = 0; i < charId.length; i++) sum += charId.charCodeAt(i);
  return WIN_VARIANTS[sum % WIN_VARIANTS.length]!;
}
