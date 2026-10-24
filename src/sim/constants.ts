/**
 * 模拟常量（数值不再散的到处都是）。
 * 坐标系：x 向右，y **向下**为正；角色原点是脚底中心，所以头顶是负 y。
 */
/** 地面线（脚底 y 的静止值） */
export const GROUND_Y = 200;
/** 重力（px/帧²）；跳跃高度由角色数据的初始 vy 决定 */
export const GRAVITY = 0.65;
/** 舞台可走范围（角色中心） */
export const STAGE_LEFT = 8;
export const STAGE_RIGHT = 312;

/** 站在地上时 hp 条上限（角色数据可覆盖，这里只是默认） */
export const DEFAULT_HP = 1000;
/** 起身无敌帧 */
export const WAKEUP_FRAMES = 12;
/** 倒地到起身的帧数 */
export const KNOCKDOWN_FRAMES = 24;
