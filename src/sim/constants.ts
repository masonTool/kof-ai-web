/**
 * 模拟常量（数值不再散的到处都是）。
 * 坐标系：x 向右，y **向下**为正；角色原点是脚底中心，所以头顶是负 y。
 */
/** 逻辑分辨率（MVS 320×224） */
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 224;

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
