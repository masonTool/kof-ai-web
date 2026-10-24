/**
 * 镜头：跟着两名角色走，靠近时拉近、拉开时放宽视野，并把画面夹在舞台内。
 *
 * 关键约束：**地面线在屏幕上永远不动**（固定在第 `GROUND_SCREEN_Y` 行）。
 * 变焦以地面为锚点，脚底不动、只让角色变大变小——这是 2D 格斗变焦唯一不晕的做法。
 */
import { GROUND_Y, STAGE_LEFT, STAGE_RIGHT, VIEW_HEIGHT, VIEW_WIDTH } from './constants';

/** 地面所在的屏幕行（= 世界地面线） */
export const GROUND_SCREEN_Y = GROUND_Y;

/** 视野最宽时的缩放（1 = 角色按原始大小画） */
export const ZOOM_MIN = 1;
/** 贴脸时的放大上限 */
export const ZOOM_MAX = 1.2;
/** 距离 ≤ 这个值就是最近（拉满） */
export const ZOOM_NEAR_DIST = 56;
/** 距离 ≥ 这个值就是最远（放开） */
export const ZOOM_FAR_DIST = 220;

/** 镜头每帧最多移动多少像素（避免瞬移感） */
export const CAMERA_MAX_STEP = 6;
/** 缩放每帧最多变化多少 */
export const CAMERA_ZOOM_STEP = 0.04;

export interface CameraBody {
  x: number;
}

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);

export class Camera {
  /** 镜头中心的世界 x */
  x: number;
  zoom: number;

  private targetX: number;
  private targetZoom: number;

  /**
   * 临时缩放覆盖（超必杀运镜用）：设了就忽略"距离决定缩放"，改用这个值。
   * 用覆盖而不是直接改 `zoom`，是因为镜头是平滑逼近目标的——直接改会被下一帧的
   * `update()` 立刻拉回去。
   */
  zoomOverride: number | null = null;

  constructor(init: { x?: number; zoom?: number } = {}) {
    const cx = init.x ?? (STAGE_LEFT + STAGE_RIGHT) / 2;
    this.zoom = init.zoom ?? ZOOM_MIN;
    this.x = this.clampX(cx, this.zoom);
    this.targetX = this.x;
    this.targetZoom = this.zoom;
  }

  /** 两人之间的距离决定缩放：近 = 拉近，远 = 放宽 */
  static zoomForDistance(distance: number): number {
    const t = clamp01((Math.abs(distance) - ZOOM_NEAR_DIST) / (ZOOM_FAR_DIST - ZOOM_NEAR_DIST));
    return ZOOM_MAX + (ZOOM_MIN - ZOOM_MAX) * t;
  }

  /** 一帧：算出目标并平滑逼近（确定性，逐帧固定步长） */
  update(a: CameraBody, b: CameraBody): void {
    this.computeTargets(a, b);

    const dx = this.targetX - this.x;
    if (dx !== 0) this.x += Math.sign(dx) * Math.min(Math.abs(dx), CAMERA_MAX_STEP);

    const dz = this.targetZoom - this.zoom;
    if (dz !== 0) this.zoom += Math.sign(dz) * Math.min(Math.abs(dz), CAMERA_ZOOM_STEP);

    this.x = this.clampX(this.x, this.zoom);
  }

  /** 立刻对齐（开局 / 换人 / 回合重置用） */
  snap(a: CameraBody, b: CameraBody): void {
    this.computeTargets(a, b);
    this.x = this.targetX;
    this.zoom = this.targetZoom;
  }

  private computeTargets(a: CameraBody, b: CameraBody): void {
    const mid = (a.x + b.x) / 2;
    const zoom = this.zoomOverride ?? Camera.zoomForDistance(b.x - a.x);
    this.targetZoom = zoom;
    this.targetX = this.clampX(mid, zoom);
  }

  /** 保证可见范围不越出舞台 */
  private clampX(x: number, zoom: number): number {
    const half = VIEW_WIDTH / (2 * zoom);
    const min = STAGE_LEFT + half;
    const max = STAGE_RIGHT - half;
    if (min > max) return (STAGE_LEFT + STAGE_RIGHT) / 2;
    return Math.min(max, Math.max(min, x));
  }

  /** 当前视野宽度（世界单位） */
  get visibleWidth(): number {
    return VIEW_WIDTH / this.zoom;
  }

  get visibleLeft(): number {
    return this.x - VIEW_WIDTH / (2 * this.zoom);
  }

  get visibleRight(): number {
    return this.x + VIEW_WIDTH / (2 * this.zoom);
  }

  worldToScreenX(wx: number): number {
    return (wx - this.x) * this.zoom + VIEW_WIDTH / 2;
  }

  /** 地面锚点：世界 y=GROUND_Y → 屏幕 y=GROUND_SCREEN_Y，与 zoom 无关 */
  worldToScreenY(wy: number): number {
    return GROUND_SCREEN_Y - (GROUND_Y - wy) * this.zoom;
  }

  screenToWorldX(sx: number): number {
    return (sx - VIEW_WIDTH / 2) / this.zoom + this.x;
  }

  screenToWorldY(sy: number): number {
    return GROUND_Y - (GROUND_SCREEN_Y - sy) / this.zoom;
  }

  /** 把画布变换设置成"之后都按世界坐标画" */
  applyTo(ctx: { translate(x: number, y: number): void; scale(x: number, y: number): void }): void {
    ctx.translate(VIEW_WIDTH / 2, GROUND_SCREEN_Y);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -GROUND_Y);
  }

  /** 视野顶部的世界 y（画天空/背景用） */
  get visibleTop(): number {
    return GROUND_Y - (GROUND_SCREEN_Y - 0) / this.zoom;
  }

  get visibleBottom(): number {
    return GROUND_Y - (GROUND_SCREEN_Y - VIEW_HEIGHT) / this.zoom;
  }
}
