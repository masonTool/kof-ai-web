/**
 * 视口缩放：逻辑分辨率 320×224（MVS）→ 窗口。
 * 规则：优先整数倍缩放（像素才锐利），窗口装不下 1 倍时才用小数缩放。
 * 纯函数部分（computeViewport）不碰 DOM，可在 node 里测。
 */
import { VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';

/** 逻辑分辨率（唯一来源在 sim/constants.ts） */
export const LOGICAL_WIDTH = VIEW_WIDTH;
export const LOGICAL_HEIGHT = VIEW_HEIGHT;

export interface Viewport {
  /** 逻辑像素 → CSS 像素 */
  scale: number;
  /** 画面在窗口里的 CSS 尺寸 */
  cssWidth: number;
  cssHeight: number;
  /** 居中留黑边的偏移（CSS 像素） */
  offsetX: number;
  offsetY: number;
  dpr: number;
}

/** 设备像素比上限：手机上 3x 屏按 3x 渲染是纯浪费（像素画 2x 已经足够锐利） */
export const MAX_DPR = 2;

/** 刘海屏/圆角的安全区（CSS 像素），由页面上的探针元素读出来 */
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function effectiveDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(MAX_DPR, Math.max(1, dpr));
}

/**
 * 竖屏提示：手机竖着拿时把画面缩得极小也没法玩，
 * 不如叠一层"请横屏"的提示。判据是"高明显大于宽"。
 */
export function shouldRotate(cssWidth: number, cssHeight: number): boolean {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  return h > w * 1.15;
}

export function computeViewport(
  cssWidth: number,
  cssHeight: number,
  dpr = 1,
  insets: SafeInsets = NO_INSETS,
): Viewport {
  const w = Math.max(1, Math.floor(cssWidth));
  const h = Math.max(1, Math.floor(cssHeight));
  // 可用区域要扣掉安全区，否则画面会被刘海/圆角切掉
  const usableW = Math.max(1, w - Math.max(0, insets.left) - Math.max(0, insets.right));
  const usableH = Math.max(1, h - Math.max(0, insets.top) - Math.max(0, insets.bottom));
  const raw = Math.min(usableW / LOGICAL_WIDTH, usableH / LOGICAL_HEIGHT);
  const scale = raw >= 1 ? Math.floor(raw) : Math.max(raw, 0.1);
  const cssW = LOGICAL_WIDTH * scale;
  const cssH = LOGICAL_HEIGHT * scale;
  return {
    scale,
    cssWidth: cssW,
    cssHeight: cssH,
    offsetX: Math.floor(Math.max(0, insets.left) + (usableW - cssW) / 2),
    offsetY: Math.floor(Math.max(0, insets.top) + (usableH - cssH) / 2),
    dpr: effectiveDpr(dpr),
  };
}

/** 把视口应用到 canvas：CSS 尺寸 + 居中 + 后备缓冲按 dpr 放大，返回绘制用的 device 缩放。 */
export function applyViewport(canvas: HTMLCanvasElement, vp: Viewport): number {
  const device = vp.scale * vp.dpr;
  canvas.width = Math.round(vp.cssWidth * vp.dpr);
  canvas.height = Math.round(vp.cssHeight * vp.dpr);
  canvas.style.width = `${vp.cssWidth}px`;
  canvas.style.height = `${vp.cssHeight}px`;
  canvas.style.left = `${vp.offsetX}px`;
  canvas.style.top = `${vp.offsetY}px`;
  return device;
}
