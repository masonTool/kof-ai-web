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
  /**
   * **角色专属**：只有这个角色有对应贴图，别的角色不该有。
   *
   * 声明在这里而不是让校验脚本用正则猜角色前缀——之前用正则，每专属化一个角色
   * 都要记得往 `check-assets.mjs` 里加前缀，漏了就会误报 26 个角色"缺动画"（踩过三次）。
   */
  exclusive?: string;
}

const p = (x: number, y: number): Point => [x, y];

/** 基本站架：双脚分开、重心居中、双手抬起 */
/**
 * 基本站架：侧身、重心略沉、前手抬到脸前、后手护在胸前、双脚前后分开。
 * 之前的站架是"正面对称"，看起来像立正——格斗角色第一步就是要把站架做对。
 */
const BASE: PoseFrame = {
  head: p(3, -71),
  neck: p(2, -61),
  hip: p(-1, -39),
  armBack: [p(-4, -52), p(2, -57)],
  armFront: [p(8, -58), p(13, -65)],
  // 侧身站架：双脚前后错开但不劈开，膝盖弯一点（原版也是"收着"站的）
  legBack: [p(-5, -24), p(-9, -1)],
  legFront: [p(5, -24), p(8, -1)],
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

/**
 * 出拳：蓄力后拉 → 打满（重心压前、后腿蹬直、肩送出去）→ 收拳回中。
 *
 * 三帧之间由 `resolvePose` 插值，所以这里的极端姿势就是"动作的峰值"：
 * 峰值越夸张，插值出来的中间帧越有力量感。
 */
function punch(reach: number, dy: number, torsoLean: number): PoseFrame[] {
  return [
    // 蓄力：拳头收在胸前、肩往后
    f({
      head: p(2 - 3, -72 + dy),
      neck: p(1 - 2, -62 + dy),
      hip: p(-1, -40 + dy),
      armFront: [p(0, -57 + dy), p(1, -52 + dy)],
      armBack: [p(-9, -53 + dy), p(-13, -49 + dy)],
      legFront: [p(5, -22), p(9, -1)],
    }),
    // 打满：拳到最远、身体前压、后腿蹬直
    f({
      head: p(2 + torsoLean * 1.4, -72 + dy),
      neck: p(1 + torsoLean * 1.2, -62 + dy),
      hip: p(torsoLean * 0.7, -40 + dy),
      armFront: [p(7 + reach * 0.7, -58 + dy), p(9 + reach * 1.55, -57 + dy)],
      armBack: [p(-9, -55 + dy), p(-16, -53 + dy)],
      legBack: [p(-6, -21), p(-14, -1)],
      legFront: [p(6, -22), p(11, -1)],
    }),
    // 收拳：手回到胸前，肩膀松下来
    f({
      head: p(2 + torsoLean * 0.5, -72 + dy),
      neck: p(1 + torsoLean * 0.4, -62 + dy),
      armFront: [p(4 + reach * 0.4, -58 + dy), p(5 + reach * 0.8, -56 + dy)],
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
      hip: p(-4, -38 + dy),
      head: p(-5, -68 + dy),
      neck: p(-6, -58 + dy),
      legFront: [p(11, -30 - height * 0.55), p(6 + reach * 1.4, -32 - height)],
      legBack: [p(-4, -18), p(-12, -1)],
      armBack: [p(-11, -52), p(-18, -46)],
      armFront: [p(6, -56), p(4, -64)],
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
  /**
   * 落地缓冲：蹲到底 → 回弹。
   *
   * 帧数必须和图集一致（图集 `landing: ['crouch','landingmid']` 两帧）。
   * 第一帧极矮、第二帧稍高——落地要看得出"被冲击压下去再弹起来"。
   */
  landing: {
    frameDuration: 3,
    loop: false,
    frames: [
      // 蹲到底（吸收冲击）
      f({
        head: p(3, -52),
        neck: p(2, -44),
        hip: p(-2, -26),
        legBack: [p(-10, -14), p(-9, -1)],
        legFront: [p(9, -14), p(11, -1)],
        armBack: [p(-8, -38), p(-14, -32)],
        armFront: [p(8, -38), p(14, -32)],
      }),
      // 回弹（膝盖还弯着）
      f({
        head: p(2, -64),
        neck: p(1, -54),
        hip: p(-1, -34),
        legBack: [p(-9, -18), p(-8, -1)],
        legFront: [p(8, -18), p(10, -1)],
        armBack: [p(-7, -46), p(-12, -38)],
        armFront: [p(7, -46), p(12, -38)],
      }),
    ],
  },
  guard: {
    frameDuration: 4,
    loop: true,
    frames: [
      f({
        head: p(-1, -71),
        neck: p(-2, -61),
        armFront: [p(5, -62), p(2, -68)],
        armBack: [p(-1, -60), p(4, -64)],
        legBack: [p(-6, -22), p(-12, -1)],
      }),
      // 被顶住：上身再缩一点，双手夹得更紧
      f({
        head: p(-3, -70),
        neck: p(-4, -60),
        hip: p(-1, -40),
        armFront: [p(4, -62), p(1, -70)],
        armBack: [p(-2, -60), p(3, -66)],
        legBack: [p(-7, -22), p(-13, -1)],
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
      // 刚被打中：头被打偏、上身向后折、双手散开
      f({
        head: p(-7, -69),
        neck: p(-7, -59),
        hip: p(-2, -40),
        armFront: [p(3, -62), p(2, -74)],
        armBack: [p(-12, -60), p(-18, -68)],
        legBack: [p(-8, -22), p(-16, -2)],
        legFront: [p(6, -22), p(13, -1)],
      }),
      // 后仰到底（这一帧最"痛"）
      f({
        head: p(-10, -66),
        neck: p(-9, -57),
        hip: p(-4, -39),
        armFront: [p(0, -58), p(-6, -70)],
        armBack: [p(-15, -55), p(-20, -62)],
        legBack: [p(-9, -22), p(-18, -2)],
      }),
      // 回了一半（接后续状态不会突然弹回中立）
      f({
        head: p(-6, -68),
        neck: p(-5, -59),
        hip: p(-2, -40),
        armFront: [p(2, -58), p(-2, -66)],
        armBack: [p(-11, -56), p(-16, -60)],
        legBack: [p(-7, -22), p(-14, -2)],
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
  /**
   * 起身：蹲着 → 半起 → 站直。
   *
   * 帧数必须和图集一致（图集 `wakeup: ['crouch','wakeupmid','wakeuplast']` 三帧）——
   * 不一致的话，贴图播放会取模绕回第一帧，看起来像"站起来又蹲回去"。
   * 第一帧极矮（蹲）、第二帧半高、第三帧接近站立，高度递增是"起身"的关键。
   */
  wakeup: {
    frameDuration: 4,
    loop: false,
    frames: [
      // 蹲着（撑地蓄力）
      {
        head: p(2, -40),
        neck: p(1, -34),
        hip: p(-4, -20),
        armBack: [p(-8, -26), p(-12, -20)],
        armFront: [p(6, -26), p(10, -20)],
        legBack: [p(-10, -11), p(-8, -1)],
        legFront: [p(8, -11), p(12, -1)],
      },
      // 半起（膝盖还弯着）
      {
        head: p(2, -56),
        neck: p(1, -48),
        hip: p(-3, -30),
        armBack: [p(-8, -38), p(-11, -28)],
        armFront: [p(7, -38), p(12, -28)],
        legBack: [p(-9, -16), p(-7, -1)],
        legFront: [p(9, -16), p(13, -1)],
      },
      // 站直（接近 idle）
      {
        head: p(0, -70),
        neck: p(0, -60),
        hip: p(0, -40),
        armBack: [p(-6, -50), p(-8, -34)],
        armFront: [p(6, -50), p(8, -34)],
        legBack: [p(-6, -20), p(-6, -1)],
        legFront: [p(6, -20), p(6, -1)],
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
  /** 波动系：双手从腰侧推出（贴图缺失时用这个程序化版本） */
  // 两帧：蓄力 → 出手。帧数必须和图集**一致**（图集现在是 2 帧），
  // 否则程序化版本会多播一帧、贴图那边取模绕回蓄力，看起来像"出手后又缩回去"
  specialProjectile: {
    frameDuration: 1,
    loop: false,
    frames: [
      f({ head: p(-2, -70), neck: p(-3, -60), armFront: [p(-2, -56), p(-8, -52)], armBack: [p(-8, -54), p(-14, -50)] }),
      f({ head: p(2, -70), neck: p(1, -60), armFront: [p(14, -58), p(30, -56)], armBack: [p(6, -58), p(18, -56)] }),
      // 收招（手收回腰侧、身体回正）
      f({ head: p(1, -70), neck: p(1, -60), armFront: [p(6, -56), p(10, -48)], armBack: [p(-4, -56), p(-6, -48)] }),
    ],
  },
  /**
   * 角色专属必杀的**程序化兜底**。
   *
   * 这些动画真正的样子来自出图（`kyspecial1` 等）；这里只是一帧兜底形状，
   * 用于"贴图没加载/加载失败"时别画出个站架。形状尽量贴近该招的意图：
   * 荒咬＝爪状上撩、毒咬＝低处上勾、鬼焼＝冲天、大蛇薙＝双手推出。
   */
  kyspecial1: {
    frameDuration: 1,
    loop: false,
    exclusive: 'kyo',
    frames: [f({ head: p(0, -68), neck: p(1, -58), armFront: [p(10, -62), p(22, -70)], armBack: [p(-6, -52), p(-10, -44)] })],
  },
  kyspecial2: {
    frameDuration: 1,
    loop: false,
    exclusive: 'kyo',
    frames: [f({ head: p(2, -64), neck: p(2, -54), hip: p(-1, -34), armFront: [p(8, -46), p(16, -54)], armBack: [p(-8, -50), p(-14, -44)] })],
  },
  kyspecial3: {
    frameDuration: 1,
    loop: false,
    exclusive: 'kyo',
    frames: [f({ head: p(1, -76), neck: p(1, -64), hip: p(0, -42), armFront: [p(6, -72), p(4, -86)], armBack: [p(-8, -52), p(-10, -44)] })],
  },
  kysuper: {
    frameDuration: 1,
    loop: false,
    exclusive: 'kyo',
    frames: [f({ head: p(0, -70), neck: p(0, -60), armFront: [p(16, -56), p(32, -54)], armBack: [p(8, -56), p(20, -54)] })],
  },
  // 八神庵专属必杀的兜底（形状接近，紫焰由特效层负责）
  iorispecial1: {
    frameDuration: 1,
    loop: false,
    exclusive: 'iori',
    frames: [f({ head: p(2, -60), neck: p(2, -52), hip: p(-2, -32), armFront: [p(12, -40), p(22, -30)], armBack: [p(-10, -52), p(-16, -46)] })],
  },
  iorispecial2: {
    frameDuration: 1,
    loop: false,
    exclusive: 'iori',
    frames: [f({ head: p(1, -76), neck: p(1, -64), hip: p(0, -42), armFront: [p(8, -72), p(6, -88)], armBack: [p(-10, -50), p(-14, -42)] })],
  },
  iorispecial3: {
    frameDuration: 1,
    loop: false,
    exclusive: 'iori',
    frames: [f({ head: p(2, -68), neck: p(2, -58), armFront: [p(14, -64), p(26, -66)], armBack: [p(-4, -58), p(-8, -60)] })],
  },
  iorisuper: {
    frameDuration: 1,
    loop: false,
    exclusive: 'iori',
    frames: [f({ head: p(3, -66), neck: p(3, -56), hip: p(0, -36), armFront: [p(16, -58), p(30, -58)], armBack: [p(4, -56), p(16, -56)] })],
  },
  // Terry / Athena 专属必杀的兜底（形状接近，光效由贴图和特效层负责）
  terryspecial1: {
    frameDuration: 1,
    loop: false,
    exclusive: 'terry',
    frames: [f({ head: p(3, -62), neck: p(3, -54), hip: p(-3, -34), armFront: [p(10, -34), p(20, -22)], armBack: [p(-12, -50), p(-18, -42)] })],
  },
  terryspecial2: {
    frameDuration: 1,
    loop: false,
    exclusive: 'terry',
    frames: [f({ head: p(6, -66), neck: p(6, -56), hip: p(2, -36), armFront: [p(16, -56), p(28, -54)], armBack: [p(-14, -50), p(-22, -44)] })],
  },
  terryspecial3: {
    frameDuration: 1,
    loop: false,
    exclusive: 'terry',
    frames: [f({ head: p(2, -74), neck: p(2, -62), hip: p(1, -40), armFront: [p(8, -64), p(14, -72)], armBack: [p(-8, -48), p(-12, -40)] })],
  },
  terrysuper: {
    frameDuration: 1,
    loop: false,
    exclusive: 'terry',
    frames: [f({ head: p(-2, -72), neck: p(-2, -62), hip: p(0, -40), armFront: [p(6, -70), p(8, -86)], armBack: [p(-8, -70), p(-10, -86)] })],
  },
  athenaspecial1: {
    frameDuration: 1,
    loop: false,
    exclusive: 'athena',
    frames: [f({ head: p(-1, -68), neck: p(-1, -58), armFront: [p(8, -56), p(4, -50)], armBack: [p(-8, -56), p(-4, -50)] })],
  },
  athenaspecial2: {
    frameDuration: 1,
    loop: false,
    exclusive: 'athena',
    frames: [f({ head: p(0, -70), neck: p(0, -60), armFront: [p(6, -68), p(6, -86)], armBack: [p(-10, -50), p(-16, -44)] })],
  },
  athenaspecial3: {
    frameDuration: 1,
    loop: false,
    exclusive: 'athena',
    frames: [f({ head: p(2, -72), neck: p(2, -62), hip: p(0, -40), legFront: [p(10, -26), p(12, -4)], legBack: [p(-8, -30), p(-10, -12)] })],
  },
  athenasuper: {
    frameDuration: 1,
    loop: false,
    exclusive: 'athena',
    frames: [f({ head: p(0, -72), neck: p(0, -62), hip: p(0, -40), armFront: [p(8, -70), p(10, -88)], armBack: [p(-8, -70), p(-10, -88)] })],
  },
  // 红丸 / 大门专属必杀的兜底
  benispecial1: {
    frameDuration: 1,
    loop: false,
    frames: [f({ head: p(5, -70), neck: p(5, -60), hip: p(1, -38), armFront: [p(16, -58), p(28, -56)], armBack: [p(-12, -52), p(-18, -46)] })],
    exclusive: 'benimaru',
  },
  benispecial2: {
    frameDuration: 1,
    loop: false,
    frames: [f({ head: p(-2, -74), neck: p(-2, -64), hip: p(0, -42), legFront: [p(14, -60), p(18, -84)], legBack: [p(-6, -22), p(-6, -1)] })],
    exclusive: 'benimaru',
  },
  benispecial3: {
    frameDuration: 1,
    loop: false,
    frames: [f({ head: p(4, -68), neck: p(3, -58), hip: p(-1, -36), armFront: [p(14, -56), p(26, -52)], armBack: [p(-6, -54), p(-10, -48)] })],
    exclusive: 'benimaru',
  },
  benisuper: {
    frameDuration: 1,
    loop: false,
    frames: [f({ head: p(3, -70), neck: p(3, -60), hip: p(0, -38), armFront: [p(18, -58), p(30, -56)], armBack: [p(6, -58), p(18, -56)] })],
    exclusive: 'benimaru',
  },
  daimonspecial1: {
    frameDuration: 1,
    loop: false,
    frames: [f({ head: p(2, -54), neck: p(2, -46), hip: p(-2, -28), armFront: [p(10, -30), p(14, -8)], armBack: [p(-10, -30), p(-14, -8)] })],
    exclusive: 'daimon',
  },
  daimonspecial2: {
    frameDuration: 1,
    loop: false,
    frames: [f({ head: p(4, -64), neck: p(4, -54), hip: p(0, -34), armFront: [p(16, -50), p(26, -40)], armBack: [p(-8, -52), p(-14, -44)] })],
    exclusive: 'daimon',
  },
  daimonsuper: {
    frameDuration: 1,
    loop: false,
    frames: [f({ head: p(-2, -74), neck: p(-2, -64), hip: p(0, -42), armFront: [p(8, -76), p(10, -92)], armBack: [p(-8, -76), p(-10, -92)] })],
    exclusive: 'daimon',
  },
  // Andy / Joe 专属必杀的兜底
  andyspecial1: { frameDuration: 1, loop: false, exclusive: 'andy', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(16, -56), p(28, -54)], armBack: [p(-10, -52), p(-16, -46)] })] },
  andyspecial2: { frameDuration: 1, loop: false, exclusive: 'andy', frames: [f({ head: p(8, -60), neck: p(8, -52), hip: p(2, -32), armFront: [p(14, -46), p(28, -40)], armBack: [p(-12, -46), p(-20, -40)] })] },
  andyspecial3: { frameDuration: 1, loop: false, exclusive: 'andy', frames: [f({ head: p(1, -76), neck: p(1, -64), hip: p(0, -42), armFront: [p(8, -72), p(6, -88)], armBack: [p(-10, -50), p(-14, -42)] })] },
  andysuper: { frameDuration: 1, loop: false, exclusive: 'andy', frames: [f({ head: p(2, -68), neck: p(2, -58), hip: p(0, -37), armFront: [p(16, -56), p(30, -54)], armBack: [p(8, -56), p(20, -54)] })] },
  joespecial1: { frameDuration: 1, loop: false, exclusive: 'joe', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(18, -56), p(30, -56)], armBack: [p(6, -56), p(18, -56)] })] },
  joespecial2: { frameDuration: 1, loop: false, exclusive: 'joe', frames: [f({ head: p(-1, -72), neck: p(-1, -62), hip: p(0, -41), legFront: [p(14, -56), p(20, -76)], legBack: [p(-6, -22), p(-6, -1)] })] },
  joespecial3: { frameDuration: 1, loop: false, exclusive: 'joe', frames: [f({ head: p(3, -70), neck: p(2, -60), hip: p(0, -40), legFront: [p(20, -48), p(30, -44)], legBack: [p(-8, -26), p(-10, -6)] })] },
  joesuper: { frameDuration: 1, loop: false, exclusive: 'joe', frames: [f({ head: p(-2, -72), neck: p(-2, -62), hip: p(0, -40), armFront: [p(10, -62), p(8, -80)], armBack: [p(-12, -50), p(-18, -42)] })] },
  // 獠 / Robert 专属必杀的兜底
  ryospecial1: { frameDuration: 1, loop: false, exclusive: 'ryo', frames: [f({ head: p(4, -68), neck: p(4, -58), hip: p(1, -37), armFront: [p(16, -58), p(30, -56)], armBack: [p(-10, -52), p(-16, -46)] })] },
  ryospecial2: { frameDuration: 1, loop: false, exclusive: 'ryo', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(18, -56), p(30, -54)], armBack: [p(6, -56), p(18, -54)] })] },
  ryospecial3: { frameDuration: 1, loop: false, exclusive: 'ryo', frames: [f({ head: p(0, -72), neck: p(0, -62), hip: p(0, -40), legFront: [p(16, -54), p(22, -76)], legBack: [p(-8, -24), p(-8, -2)] })] },
  ryosuper: { frameDuration: 1, loop: false, exclusive: 'ryo', frames: [f({ head: p(-1, -70), neck: p(-1, -60), hip: p(0, -38), armFront: [p(16, -58), p(32, -56)], armBack: [p(8, -58), p(22, -56)] })] },
  robspecial1: { frameDuration: 1, loop: false, exclusive: 'robert', frames: [f({ head: p(4, -68), neck: p(4, -58), hip: p(1, -37), armFront: [p(16, -58), p(28, -58)], armBack: [p(-10, -52), p(-16, -46)] })] },
  robspecial2: { frameDuration: 1, loop: false, exclusive: 'robert', frames: [f({ head: p(3, -70), neck: p(2, -60), hip: p(0, -38), legFront: [p(18, -50), p(28, -44)], legBack: [p(-8, -26), p(-10, -6)] })] },
  robspecial3: { frameDuration: 1, loop: false, exclusive: 'robert', frames: [f({ head: p(1, -74), neck: p(1, -64), hip: p(0, -41), legFront: [p(14, -58), p(16, -82)], legBack: [p(-6, -22), p(-6, -1)] })] },
  robsuper: { frameDuration: 1, loop: false, exclusive: 'robert', frames: [f({ head: p(3, -68), neck: p(3, -58), hip: p(0, -37), armFront: [p(16, -56), p(28, -50)], armBack: [p(-6, -54), p(-12, -48)] })] },
  // Yuri / Leona 专属必杀的兜底（key 必须与 anim 名一致）
  yurispecial1: { frameDuration: 1, loop: false, exclusive: 'yuri', frames: [f({ head: p(4, -68), neck: p(4, -58), hip: p(1, -37), armFront: [p(16, -58), p(30, -56)], armBack: [p(-10, -52), p(-16, -46)] })] },
  yurispecial2: { frameDuration: 1, loop: false, exclusive: 'yuri', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(18, -56), p(30, -54)], armBack: [p(6, -56), p(18, -54)] })] },
  yurispecial3: { frameDuration: 1, loop: false, exclusive: 'yuri', frames: [f({ head: p(-1, -72), neck: p(-1, -62), hip: p(0, -40), legFront: [p(16, -54), p(22, -74)], legBack: [p(-6, -22), p(-6, -1)] })] },
  yurisuper: { frameDuration: 1, loop: false, exclusive: 'yuri', frames: [f({ head: p(-1, -70), neck: p(-1, -60), hip: p(0, -38), armFront: [p(16, -58), p(32, -56)], armBack: [p(8, -58), p(22, -56)] })] },
  leonaspecial1: { frameDuration: 1, loop: false, exclusive: 'leona', frames: [f({ head: p(2, -64), neck: p(2, -54), hip: p(-1, -34), armFront: [p(14, -52), p(24, -46)], armBack: [p(-14, -52), p(-24, -46)] })] },
  leonaspecial2: { frameDuration: 1, loop: false, exclusive: 'leona', frames: [f({ head: p(3, -66), neck: p(3, -56), hip: p(0, -36), armFront: [p(12, -60), p(18, -30)], armBack: [p(-8, -50), p(-12, -42)] })] },
  leonaspecial3: { frameDuration: 1, loop: false, exclusive: 'leona', frames: [f({ head: p(4, -54), neck: p(4, -46), hip: p(-2, -28), armFront: [p(14, -34), p(24, -20)], armBack: [p(-10, -46), p(-16, -38)] })] },
  leonasuper: { frameDuration: 1, loop: false, exclusive: 'leona', frames: [f({ head: p(0, -70), neck: p(0, -60), hip: p(0, -38), armFront: [p(16, -58), p(30, -54)], armBack: [p(-14, -58), p(-28, -54)] })] },
  // Ralf / Clark 专属必杀的兜底（key 与 anim 名一致）
  ralfspecial1: { frameDuration: 1, loop: false, exclusive: 'ralf', frames: [f({ head: p(6, -68), neck: p(6, -58), hip: p(2, -37), armFront: [p(20, -56), p(32, -54)], armBack: [p(8, -56), p(20, -54)] })] },
  ralfspecial2: { frameDuration: 1, loop: false, exclusive: 'ralf', frames: [f({ head: p(4, -66), neck: p(3, -56), hip: p(0, -36), armFront: [p(18, -58), p(30, -62)], armBack: [p(-14, -48), p(-20, -40)] })] },
  ralfspecial3: { frameDuration: 1, loop: false, exclusive: 'ralf', frames: [f({ head: p(8, -64), neck: p(8, -54), hip: p(3, -34), armFront: [p(18, -50), p(30, -46)], armBack: [p(-10, -46), p(-16, -40)] })] },
  ralfsuper: { frameDuration: 1, loop: false, exclusive: 'ralf', frames: [f({ head: p(6, -68), neck: p(6, -58), hip: p(2, -37), armFront: [p(20, -56), p(34, -54)], armBack: [p(10, -56), p(24, -54)] })] },
  clarkspecial1: { frameDuration: 1, loop: false, exclusive: 'clark', frames: [f({ head: p(6, -64), neck: p(6, -54), hip: p(2, -34), armFront: [p(16, -52), p(26, -48)], armBack: [p(-10, -52), p(-20, -48)] })] },
  clarkspecial2: { frameDuration: 1, loop: false, exclusive: 'clark', frames: [f({ head: p(-4, -60), neck: p(-4, -52), hip: p(-2, -32), armFront: [p(10, -62), p(14, -78)], armBack: [p(-8, -56), p(-12, -72)] })] },
  clarkspecial3: { frameDuration: 1, loop: false, exclusive: 'clark', frames: [f({ head: p(4, -52), neck: p(4, -44), hip: p(0, -26), armFront: [p(12, -38), p(18, -30)], armBack: [p(-8, -38), p(-14, -30)] })] },
  clarksuper: { frameDuration: 1, loop: false, exclusive: 'clark', frames: [f({ head: p(-2, -66), neck: p(-2, -56), hip: p(0, -38), armFront: [p(8, -78), p(10, -94)], armBack: [p(-8, -78), p(-10, -94)] })] },
  // Kensou / Chin 专属必杀的兜底（key 与 anim 名一致）
  kensouspecial1: { frameDuration: 1, loop: false, exclusive: 'kensou', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(16, -58), p(30, -56)], armBack: [p(8, -58), p(22, -56)] })] },
  kensouspecial2: { frameDuration: 1, loop: false, exclusive: 'kensou', frames: [f({ head: p(1, -74), neck: p(1, -64), hip: p(0, -41), armFront: [p(8, -70), p(6, -86)], armBack: [p(-10, -50), p(-14, -42)] })] },
  kensouspecial3: { frameDuration: 1, loop: false, exclusive: 'kensou', frames: [f({ head: p(6, -68), neck: p(6, -58), hip: p(2, -37), armFront: [p(18, -56), p(30, -54)], armBack: [p(6, -56), p(18, -54)] })] },
  kensousuper: { frameDuration: 1, loop: false, exclusive: 'kensou', frames: [f({ head: p(0, -70), neck: p(0, -60), hip: p(0, -38), armFront: [p(16, -58), p(32, -56)], armBack: [p(6, -58), p(20, -56)] })] },
  chinspecial1: { frameDuration: 1, loop: false, exclusive: 'chin', frames: [f({ head: p(6, -56), neck: p(6, -48), hip: p(2, -30), armFront: [p(18, -46), p(28, -42)], armBack: [p(-10, -46), p(-16, -40)] })] },
  chinspecial2: { frameDuration: 1, loop: false, exclusive: 'chin', frames: [f({ head: p(-6, -50), neck: p(-6, -44), hip: p(-4, -26), legFront: [p(14, -14), p(24, -6)], armBack: [p(-12, -34), p(-18, -28)] })] },
  chinspecial3: { frameDuration: 1, loop: false, exclusive: 'chin', frames: [f({ head: p(5, -58), neck: p(4, -50), hip: p(-2, -30), armFront: [p(12, -44), p(18, -36)], armBack: [p(-10, -46), p(-14, -40)] })] },
  chinsuper: { frameDuration: 1, loop: false, exclusive: 'chin', frames: [f({ head: p(3, -58), neck: p(3, -50), hip: p(0, -30), armFront: [p(18, -52), p(30, -48)], armBack: [p(-16, -52), p(-28, -48)] })] },
  // Kim / Choi 专属必杀的兜底（key 与 anim 名一致）
  kimspecial1: { frameDuration: 1, loop: false, exclusive: 'kim', frames: [f({ head: p(2, -66), neck: p(1, -56), hip: p(0, -36), legFront: [p(16, -62), p(22, -84)], legBack: [p(-6, -22), p(-6, -1)] })] },
  kimspecial2: { frameDuration: 1, loop: false, exclusive: 'kim', frames: [f({ head: p(1, -74), neck: p(1, -64), hip: p(0, -41), legFront: [p(14, -58), p(18, -80)], legBack: [p(-8, -24), p(-8, -2)] })] },
  kimspecial3: { frameDuration: 1, loop: false, exclusive: 'kim', frames: [f({ head: p(2, -70), neck: p(2, -60), hip: p(0, -40), legFront: [p(18, -50), p(28, -44)], legBack: [p(-10, -40), p(-14, -28)] })] },
  kimsuper: { frameDuration: 1, loop: false, exclusive: 'kim', frames: [f({ head: p(3, -70), neck: p(2, -60), hip: p(0, -40), legFront: [p(22, -52), p(32, -46)], legBack: [p(-8, -26), p(-10, -8)] })] },
  choispecial1: { frameDuration: 1, loop: false, exclusive: 'choi', frames: [f({ head: p(3, -64), neck: p(3, -54), hip: p(0, -34), armFront: [p(16, -54), p(26, -50)], armBack: [p(-12, -48), p(-20, -42)] })] },
  choispecial2: { frameDuration: 1, loop: false, exclusive: 'choi', frames: [f({ head: p(1, -70), neck: p(1, -60), hip: p(0, -38), armFront: [p(14, -54), p(16, -72)], armBack: [p(-10, -50), p(-14, -42)] })] },
  choispecial3: { frameDuration: 1, loop: false, exclusive: 'choi', frames: [f({ head: p(6, -52), neck: p(6, -44), hip: p(1, -26), armFront: [p(16, -38), p(28, -32)], armBack: [p(-10, -38), p(-18, -32)] })] },
  choisuper: { frameDuration: 1, loop: false, exclusive: 'choi', frames: [f({ head: p(2, -62), neck: p(2, -52), hip: p(0, -32), armFront: [p(18, -52), p(30, -46)], armBack: [p(-16, -52), p(-28, -46)] })] },
  // Chang / Billy 专属必杀的兜底（key 与 anim 名一致）
  changspecial1: { frameDuration: 1, loop: false, exclusive: 'chang', frames: [f({ head: p(6, -58), neck: p(6, -50), hip: p(2, -30), armFront: [p(22, -52), p(34, -56)], armBack: [p(-14, -50), p(-24, -54)] })] },
  changspecial2: { frameDuration: 1, loop: false, exclusive: 'chang', frames: [f({ head: p(4, -60), neck: p(4, -52), hip: p(1, -30), armFront: [p(10, -74), p(12, -90)], armBack: [p(-8, -74), p(-10, -90)] })] },
  changspecial3: { frameDuration: 1, loop: false, exclusive: 'chang', frames: [f({ head: p(-4, -56), neck: p(-4, -48), hip: p(-2, -28), armFront: [p(12, -60), p(16, -76)], armBack: [p(-10, -54), p(-14, -70)] })] },
  changsuper: { frameDuration: 1, loop: false, exclusive: 'chang', frames: [f({ head: p(5, -58), neck: p(5, -50), hip: p(1, -30), armFront: [p(24, -54), p(36, -58)], armBack: [p(-18, -52), p(-30, -56)] })] },
  billyspecial1: { frameDuration: 1, loop: false, exclusive: 'billy', frames: [f({ head: p(3, -70), neck: p(3, -60), hip: p(0, -38), armFront: [p(18, -58), p(32, -54)], armBack: [p(-10, -56), p(-20, -52)] })] },
  billyspecial2: { frameDuration: 1, loop: false, exclusive: 'billy', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(20, -56), p(34, -56)], armBack: [p(-8, -54), p(-16, -50)] })] },
  billyspecial3: { frameDuration: 1, loop: false, exclusive: 'billy', frames: [f({ head: p(4, -68), neck: p(4, -58), hip: p(0, -37), armFront: [p(18, -56), p(30, -52)], armBack: [p(-12, -54), p(-22, -50)] })] },
  billysuper: { frameDuration: 1, loop: false, exclusive: 'billy', frames: [f({ head: p(3, -70), neck: p(2, -60), hip: p(0, -38), armFront: [p(20, -58), p(34, -56)], armBack: [p(-16, -58), p(-30, -56)] })] },
  // Eiji / Shingo 专属必杀的兜底（key 与 anim 名一致）
  eijispecial1: { frameDuration: 1, loop: false, exclusive: 'eiji', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(18, -58), p(32, -50)], armBack: [p(-8, -54), p(-16, -48)] })] },
  eijispecial2: { frameDuration: 1, loop: false, exclusive: 'eiji', frames: [f({ head: p(6, -66), neck: p(6, -56), hip: p(2, -36), armFront: [p(16, -46), p(28, -62)], armBack: [p(-10, -52), p(-18, -46)] })] },
  eijispecial3: { frameDuration: 1, loop: false, exclusive: 'eiji', frames: [f({ head: p(8, -54), neck: p(8, -46), hip: p(3, -28), armFront: [p(16, -38), p(30, -34)], armBack: [p(-12, -42), p(-20, -38)] })] },
  eijisuper: { frameDuration: 1, loop: false, exclusive: 'eiji', frames: [f({ head: p(4, -68), neck: p(4, -58), hip: p(0, -37), armFront: [p(20, -56), p(34, -52)], armBack: [p(-14, -56), p(-28, -52)] })] },
  shingospecial1: { frameDuration: 1, loop: false, exclusive: 'shingo', frames: [f({ head: p(5, -68), neck: p(5, -58), hip: p(1, -37), armFront: [p(18, -56), p(30, -56)], armBack: [p(-10, -52), p(-16, -46)] })] },
  shingospecial2: { frameDuration: 1, loop: false, exclusive: 'shingo', frames: [f({ head: p(-2, -70), neck: p(-2, -60), hip: p(0, -39), legFront: [p(18, -52), p(28, -48)], legBack: [p(-8, -24), p(-8, -2)] })] },
  shingospecial3: { frameDuration: 1, loop: false, exclusive: 'shingo', frames: [f({ head: p(2, -70), neck: p(2, -60), hip: p(0, -39), armFront: [p(10, -66), p(8, -80)], armBack: [p(-10, -50), p(-14, -42)] })] },
  shingosuper: { frameDuration: 1, loop: false, exclusive: 'shingo', frames: [f({ head: p(6, -68), neck: p(6, -58), hip: p(2, -37), armFront: [p(20, -56), p(32, -54)], armBack: [p(8, -56), p(20, -54)] })] },
  // 三天王专属必杀的兜底（key 与 anim 名一致）
  yashirospecial1: { frameDuration: 1, loop: false, exclusive: 'yashiro', frames: [f({ head: p(6, -68), neck: p(6, -58), hip: p(2, -37), armFront: [p(18, -56), p(30, -54)], armBack: [p(-10, -52), p(-16, -46)] })] },
  yashirospecial2: { frameDuration: 1, loop: false, exclusive: 'yashiro', frames: [f({ head: p(5, -66), neck: p(5, -56), hip: p(1, -36), armFront: [p(10, -74), p(12, -90)], armBack: [p(-8, -50), p(-14, -42)] })] },
  yashirospecial3: { frameDuration: 1, loop: false, exclusive: 'yashiro', frames: [f({ head: p(3, -68), neck: p(3, -58), hip: p(0, -37), armFront: [p(16, -58), p(28, -56)], armBack: [p(-10, -54), p(-16, -48)] })] },
  yashirosuper: { frameDuration: 1, loop: false, exclusive: 'yashiro', frames: [f({ head: p(4, -58), neck: p(4, -50), hip: p(0, -30), armFront: [p(18, -46), p(30, -40)], armBack: [p(-16, -46), p(-28, -40)] })] },
  shermiespecial1: { frameDuration: 1, loop: false, exclusive: 'shermie', frames: [f({ head: p(4, -70), neck: p(4, -60), hip: p(1, -39), armFront: [p(16, -58), p(30, -56)], armBack: [p(6, -58), p(20, -56)] })] },
  shermiespecial2: { frameDuration: 1, loop: false, exclusive: 'shermie', frames: [f({ head: p(-4, -66), neck: p(-4, -56), hip: p(-2, -36), armFront: [p(12, -62), p(16, -78)], armBack: [p(-10, -56), p(-14, -72)] })] },
  shermiespecial3: { frameDuration: 1, loop: false, exclusive: 'shermie', frames: [f({ head: p(2, -70), neck: p(1, -60), hip: p(0, -39), legFront: [p(20, -50), p(30, -44)], legBack: [p(-8, -26), p(-10, -8)] })] },
  shermiesuper: { frameDuration: 1, loop: false, exclusive: 'shermie', frames: [f({ head: p(-6, -62), neck: p(-6, -54), hip: p(-3, -34), armFront: [p(10, -58), p(14, -74)], armBack: [p(-8, -54), p(-12, -70)] })] },
  chrisspecial1: { frameDuration: 1, loop: false, exclusive: 'chris', frames: [f({ head: p(4, -70), neck: p(4, -60), hip: p(1, -38), armFront: [p(16, -58), p(30, -56)], armBack: [p(-10, -52), p(-16, -46)] })] },
  chrisspecial2: { frameDuration: 1, loop: false, exclusive: 'chris', frames: [f({ head: p(8, -54), neck: p(8, -46), hip: p(2, -28), legFront: [p(20, -18), p(32, -8)], legBack: [p(-10, -16), p(-14, -2)] })] },
  chrisspecial3: { frameDuration: 1, loop: false, exclusive: 'chris', frames: [f({ head: p(1, -74), neck: p(1, -64), hip: p(0, -41), armFront: [p(10, -66), p(8, -82)], armBack: [p(-10, -50), p(-14, -42)] })] },
  chrissuper: { frameDuration: 1, loop: false, exclusive: 'chris', frames: [f({ head: p(-2, -70), neck: p(-2, -60), hip: p(0, -38), armFront: [p(14, -58), p(28, -54)], armBack: [p(-14, -58), p(-28, -54)] })] },
  /** 升龙系：整个人向上冲，手臂上举 */
  specialUppercut: {
    frameDuration: 1,
    loop: false,
    frames: [
      // 屈膝蓄力
      f({ head: p(0, -62), neck: p(0, -52), hip: p(0, -32), armFront: [p(4, -50), p(6, -44)], legFront: [p(6, -18), p(8, -1)] }),
      // 冲天（拳向上、身体伸展）
      f({ head: p(2, -78), neck: p(1, -66), hip: p(0, -42), armFront: [p(6, -70), p(4, -84)], legFront: [p(8, -26), p(10, -6)] }),
      // 收招（落地缓冲、拳收回胸前）
      f({ head: p(1, -68), neck: p(1, -58), hip: p(0, -36), armFront: [p(6, -56), p(8, -48)], legFront: [p(7, -20), p(9, -1)] }),
    ],
  },
  /** 突进系：低身前冲，肩膀在前 */
  specialRush: {
    frameDuration: 1,
    loop: false,
    frames: [
      // 压到后腿（蓄势）
      f({ head: p(-4, -66), neck: p(-4, -56), hip: p(-2, -37), armFront: [p(-2, -54), p(-6, -48)], armBack: [p(-10, -52), p(-16, -48)] }),
      // 撞出去（肩膀在前）
      f({ head: p(8, -64), neck: p(6, -55), hip: p(4, -36), armFront: [p(4, -52), p(10, -46)], armBack: [p(-14, -50), p(-22, -44)] }),
      // 收招（刹住、拉起来站稳）
      f({ head: p(2, -68), neck: p(2, -58), hip: p(0, -38), armFront: [p(2, -54), p(4, -46)], armBack: [p(-6, -52), p(-8, -44)] }),
    ],
  },
  /** 超必杀蓄力：双拳收腰，身体后仰 */
  /**
   * 超必杀三段：起手 → 蓄满 → 释放收招。
   * 帧数必须和图集一致（三帧）；原来是两帧，缺"收招"，放完超必杀会硬切回站架。
   */
  superCharge: {
    frameDuration: 1,
    loop: false,
    frames: [
      // 起手（气开始汇聚，身体微沉）
      f({ head: p(-3, -70), neck: p(-4, -60), armFront: [p(-4, -54), p(-10, -50)], armBack: [p(-10, -54), p(-16, -50)] }),
      // 蓄满（气浪最大，整个人被撑起来）
      f({ head: p(-6, -72), neck: p(-7, -62), armFront: [p(-8, -56), p(-14, -52)], armBack: [p(-14, -56), p(-20, -52)] }),
      // 收招（前甩收回、回到直立）
      f({ head: p(-1, -70), neck: p(-1, -60), armFront: [p(2, -54), p(4, -44)], armBack: [p(-6, -54), p(-8, -44)] }),
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
  /**
   * 败北：挨打 → 跪地。
   * 帧数必须和图集一致（`lose: ['hit','losemid']` 两帧），高度递减是"垮下去"的关键。
   */
  lose: {
    frameDuration: 10,
    loop: false,
    frames: [
      // 挨打（还站着）
      f({ head: p(-2, -60), neck: p(-1, -50), hip: p(-2, -32), armFront: [p(6, -44), p(10, -36)], armBack: [p(-8, -44), p(-12, -36)] }),
      // 跪地
      f({ head: p(2, -38), neck: p(1, -32), hip: p(-3, -18), armFront: [p(8, -24), p(12, -20)], armBack: [p(-8, -24), p(-12, -20)] }),
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

/**
 * **角色专属**姿势：只有那个角色自己有贴图，别的角色不该有。
 *
 * 命名约定：`<角色id前缀>special<N>` / `<角色id前缀>super`。
 * `art:check` 会把这些从"所有角色都必须有"的清单里排除，
 * 否则每新增一个角色的专属招式，其余 26 个角色都会被报"缺动画"。
 */


/** 所有程序化姿势名（含角色专属的，供绘制层查表） */
export function poseNames(): string[] {
  return Object.keys(POSE_LIBRARY);
}

/** 只属于某个角色、不该要求全员都有的姿势（读 `exclusive` 字段，不靠名字猜） */
export function exclusivePoseNames(): string[] {
  return Object.entries(POSE_LIBRARY)
    .filter(([, pose]) => pose.exclusive !== undefined)
    .map(([name]) => name);
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

/** 关键帧之间怎么过渡 */
export type Easing = 'linear' | 'out' | 'inOut';

const EASE: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  // 快出慢停：出拳/踢腿要"啪"地到位，不能匀速滑过去
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpPoint = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** 两个关键帧之间插值 */
export function lerpFrame(a: PoseFrame, b: PoseFrame, t: number): PoseFrame {
  const k = Math.min(1, Math.max(0, t));
  return {
    head: lerpPoint(a.head, b.head, k),
    neck: lerpPoint(a.neck, b.neck, k),
    hip: lerpPoint(a.hip, b.hip, k),
    armBack: [lerpPoint(a.armBack[0], b.armBack[0], k), lerpPoint(a.armBack[1], b.armBack[1], k)],
    armFront: [lerpPoint(a.armFront[0], b.armFront[0], k), lerpPoint(a.armFront[1], b.armFront[1], k)],
    legBack: [lerpPoint(a.legBack[0], b.legBack[0], k), lerpPoint(a.legBack[1], b.legBack[1], k)],
    legFront: [lerpPoint(a.legFront[0], b.legFront[0], k), lerpPoint(a.legFront[1], b.legFront[1], k)],
  };
}

/**
 * 按时间取当前姿势（**关键帧之间插值**）。
 *
 * 以前是直接跳到下一张关键帧——三帧的出拳就是"举着→伸出去→收回来"三次硬切，
 * 看起来像木偶。插值之后同一套三帧数据能连续动起来，这是"像真人在打"最省的一块。
 *
 * 出招用 `out` 缓动（快出慢停），待机/走路用 `inOut`（呼吸感）。
 */
/** 在某一时刻采样（不带惯性） */
function sampleAt(anim: string, elapsed: number, duration: number | undefined, ease: Easing): PoseFrame {
  const pose = hasPose(anim) ? POSE_LIBRARY[anim]! : POSE_LIBRARY['idle']!;
  const count = pose.frames.length;
  if (count <= 1) return pose.frames[0]!;

  const span =
    duration !== undefined && duration > 0 ? duration / count : Math.max(1, pose.frameDuration);
  const pos = Math.max(0, elapsed) / span;
  const index = Math.floor(pos);
  const frac = pos - index;

  // 非循环动画走到末帧就定住（受击/出招的收尾不该弹回第一帧）
  if (!pose.loop && index >= count - 1) return pose.frames[count - 1]!;

  const from = pose.frames[index % count]!;
  const to = pose.frames[(index + 1) % count]!;
  return lerpFrame(from, to, EASE[ease](Math.min(1, Math.max(0, frac))));
}

/**
 * 取当前姿势。
 *
 * `lag` = 惯性：把"上一小段时间的姿势"和当前姿势混一下，身体会轻微拖在后面，
 * 动作就有了重量感（真人甩拳时躯干和头是跟着走的，不是整块一起平移）。
 * 0 = 不拖（贴图/调试用），0.25~0.4 比较自然。
 */
export function resolvePose(
  anim: string,
  elapsed: number,
  duration?: number,
  ease: Easing = 'out',
  lag = 0,
): PoseFrame {
  const current = sampleAt(anim, elapsed, duration, ease);
  if (lag <= 0) return current;
  const lagFrames = duration !== undefined && duration > 0 ? Math.max(1, duration * 0.06) : 1.5;
  const previous = sampleAt(anim, elapsed - lagFrames, duration, ease);
  return lerpFrame(current, previous, Math.min(0.6, Math.max(0, lag)));
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

/** 循环类动画用 inOut 缓动（呼吸感），出招类用 out（快出慢停） */
export function easeForAnim(anim: string): Easing {
  return POSE_LIBRARY[anim]?.loop === true ? 'inOut' : 'out';
}

/** 这套姿势是不是"打出去"的动作（画挥击拖尾用） */
export function isAttackAnim(anim: string): boolean {
  return anim.startsWith('punch') || anim.startsWith('kick') || anim === 'special' || anim === 'super';
}
