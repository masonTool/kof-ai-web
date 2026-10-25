/**
 * 模拟常量（数值不再散的到处都是）。
 * 坐标系：x 向右，y **向下**为正；角色原点是脚底中心，所以头顶是负 y。
 */
/**
 * 设计基准分辨率（MVS 320×224）。
 *
 * 宽屏设备上 `VIEW_WIDTH` 会被调大（看得到更多舞台），但**基准永远是 320**——
 * 所有 "这个数是不是 320 的一半" 的判断都用它，别用会变的那个。
 */
export const DESIGN_VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 224;

/**
 * 当前可视宽度（逻辑单位）：16:9 屏幕上会比 320 宽，看到更多场景。
 *
 * 用 `let` + setter 而不是常量，是因为 ES module 的导入是**活绑定**：
 * 各模块 `import { VIEW_WIDTH }` 拿到的会跟着变，不用把所有调用点改成函数调用。
 * 高度永远 224（判定/跳跃都按它算），所以这里是唯一的自由度。
 */
export let VIEW_WIDTH = DESIGN_VIEW_WIDTH;

/** 可视宽度的上下限（再宽就露出舞台外，再窄就是竖屏了） */
export const VIEW_WIDTH_MIN = DESIGN_VIEW_WIDTH;
export const VIEW_WIDTH_MAX = 480;

/**
 * 按窗口长宽比设置可视宽度。
 *
 * 为什么不加宽就得留黑边：世界是 224 高、4:3 的内容，放到 16:9 的屏幕上
 * 要么左右留白，要么看宽一点。加宽只影响"看得见多少"，判定盒/跳跃/帧数据全不变。
 */
export function setViewWidthByAspect(cssWidth: number, cssHeight: number): number {
  const aspect = cssWidth / Math.max(1, cssHeight);
  const raw = Math.round(VIEW_HEIGHT * aspect);
  const next = Math.min(VIEW_WIDTH_MAX, Math.max(VIEW_WIDTH_MIN, raw));
  VIEW_WIDTH = next;
  return next;
}

/** 地面线（脚底 y 的静止值），同时也是地面在屏幕上的行号 */
export const GROUND_Y = 200;
/** 重力（px/帧²）；跳跃高度由角色数据的初始 vy 决定 */
export const GRAVITY = 0.65;
/**
 * 舞台可走范围（角色中心）。
 * 比一屏宽（512 > 320）——否则镜头无从平移，KOF 的"走位+镜头跟拍"就没了。
 */
export const STAGE_LEFT = 8;
export const STAGE_RIGHT = 504;

/** 对战血量默认值（角色数据可覆盖） */
export const DEFAULT_HP = 1000;
/** 气槽上限（KOF97 是 MAX 槽；超必杀按 50 / 100 扣） */
export const METER_MAX = 100;
/** 起身无敌帧 */
export const WAKEUP_FRAMES = 12;
/** 倒地到起身的帧数 */
export const KNOCKDOWN_FRAMES = 24;

/** 削防：连续防御累积到这个值就崩防 */
export const GUARD_CRUSH_MAX = 100;
/** 崩防后的受击硬直帧（KOF97 崩防 = 大硬直，够打一套） */
export const GUARD_CRUSH_STUN = 38;
/** 气绝：晕眩值上限 */
export const STUN_MAX = 100;
/** 晕眩持续时间（摇杆/按键能缩短） */
export const DIZZY_FRAMES = 96;
/** MAX 模式：启动消耗的气槽 */
export const MAX_MODE_METER = 100;
/** MAX 模式持续时间（15 秒） */
export const MAX_MODE_FRAMES = 900;
/** MAX 模式下的伤害倍率 */
export const MAX_MODE_DAMAGE = 1.25;
/** 轻点↑多久内松手算小跳 */
export const JUMP_CUT_FRAMES = 6;
/** 倒地后最早几帧可以按 AB 受身 */
export const QUICK_WAKEUP_MIN = 4;
