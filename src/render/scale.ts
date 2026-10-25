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

/**
 * 渲染超采样倍数：后备缓冲再乘一遍，交给浏览器缩回 CSS 尺寸。
 *
 * 为什么不是"直接调大逻辑分辨率"：逻辑分辨率一改，全部世界坐标/判定盒/镜头都要跟着走，
 * 而屏幕上能显示的物理像素是窗口大小决定的、不会因此变多。超采样只动**光栅化密度**——
 * 线条、文字、贴图都在 2 倍的缓冲里画完再缩回去，等于把整个画面提升一档分辨率，
 * 而世界坐标一个都不用改。代价是填充率 ×4（3840×2688），独显/Apple Silicon 无压力。
 */
export const RENDER_SCALE = 2;

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

export interface ViewportOptions {
  /**
   * 铺满模式：不取整数倍，直接按比例铺（最大程度填满屏幕）。
   *
   * 桌面端保持整数倍（像素画才锐利）；手机端必须铺满——整数倍在 390 高的横屏上
   * 只能取 1 倍，画布缩成 320×224 蹲在屏幕中间，四周全是黑边。
   */
  fill?: boolean;
}

export function computeViewport(
  cssWidth: number,
  cssHeight: number,
  dpr = 1,
  insets: SafeInsets = NO_INSETS,
  opts: ViewportOptions = {},
): Viewport {
  const w = Math.max(1, Math.floor(cssWidth));
  const h = Math.max(1, Math.floor(cssHeight));
  // 可用区域要扣掉安全区，否则画面会被刘海/圆角切掉
  const usableW = Math.max(1, w - Math.max(0, insets.left) - Math.max(0, insets.right));
  const usableH = Math.max(1, h - Math.max(0, insets.top) - Math.max(0, insets.bottom));
  const raw = Math.min(usableW / LOGICAL_WIDTH, usableH / LOGICAL_HEIGHT);
  // 铺满模式：小数倍也接受（画布边缘会有轻微非整数缩放，手机上看不出来）
  const scale = opts.fill === true ? Math.max(raw, 0.1) : raw >= 1 ? Math.floor(raw) : Math.max(raw, 0.1);
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

/**
 * 把视口应用到 canvas：CSS 尺寸 + 居中 + 后备缓冲按 dpr × 超采样放大，
 * 返回绘制用的 device 缩放（含超采样，直接用 `setTransform(device,0,0,device,0,0)`）。
 */
/**
 * 把视口应用到 canvas。
 *
 * `coverWindow` = true 时**画布铺满整个窗口**，而游戏内容仍按 4:3 居中：
 * 内容区之外的左右两条用背景色填掉，视觉上不再有"黑边"。
 * 返回的 `device` 是内容缩放，`offsetX/offsetY` 是内容在画布内的偏移
 * （调用方 setTransform 时要用，否则贴到左上角）。
 */
export function applyViewport(
  canvas: HTMLCanvasElement,
  vp: Viewport,
  coverWindow = false,
): { device: number; offsetX: number; offsetY: number } {
  const device = vp.scale * vp.dpr * RENDER_SCALE;
  if (!coverWindow) {
    canvas.width = Math.round(vp.cssWidth * vp.dpr * RENDER_SCALE);
    canvas.height = Math.round(vp.cssHeight * vp.dpr * RENDER_SCALE);
    canvas.style.width = `${vp.cssWidth}px`;
    canvas.style.height = `${vp.cssHeight}px`;
    canvas.style.left = `${vp.offsetX}px`;
    canvas.style.top = `${vp.offsetY}px`;
    return { device, offsetX: 0, offsetY: 0 };
  }
  // 铺满窗口：画布 = 整个窗口，内容居中（左右各留一条背景）
  const w = Math.round((vp.cssWidth + vp.offsetX * 2) * vp.dpr * RENDER_SCALE);
  const h = Math.round((vp.cssHeight + vp.offsetY * 2) * vp.dpr * RENDER_SCALE);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${vp.cssWidth + vp.offsetX * 2}px`;
  canvas.style.height = `${vp.cssHeight + vp.offsetY * 2}px`;
  canvas.style.left = '0px';
  canvas.style.top = '0px';
  return { device, offsetX: Math.round(vp.offsetX * vp.dpr * RENDER_SCALE), offsetY: Math.round(vp.offsetY * vp.dpr * RENDER_SCALE) };
}
