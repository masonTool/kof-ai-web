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

export function computeViewport(cssWidth: number, cssHeight: number, dpr = 1): Viewport {
  const w = Math.max(1, Math.floor(cssWidth));
  const h = Math.max(1, Math.floor(cssHeight));
  const raw = Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
  const scale = raw >= 1 ? Math.floor(raw) : Math.max(raw, 0.1);
  const cssW = LOGICAL_WIDTH * scale;
  const cssH = LOGICAL_HEIGHT * scale;
  return {
    scale,
    cssWidth: cssW,
    cssHeight: cssH,
    offsetX: Math.floor((w - cssW) / 2),
    offsetY: Math.floor((h - cssH) / 2),
    dpr: dpr > 0 ? dpr : 1,
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
