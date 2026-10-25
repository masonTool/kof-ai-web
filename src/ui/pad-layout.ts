/**
 * 手机手台的布局（纯函数：给定屏幕尺寸与安全区，算出每个控件的圆心和半径）。
 *
 * 为什么不用 CSS 固定 px：同一套 px 在 6 寸手机和 13 寸平板上手感差一倍，
 * 在横屏平板上按钮小到点不中、在窄屏上又糊住半个画面。
 * 所以统一按**短边**（min(宽,高)）取比例——无论横竖、无论设备，控件占屏幕的比例恒定。
 *
 * 输出是"圆心 + 半径"，DOM 那边只是把它们套到绝对定位上，测过的数就是跑起来的数。
 */

export interface PadInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_PAD_INSETS: PadInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface PadLayout {
  /** 参考尺寸 = min(宽,高) */
  unit: number;
  /** 左摇杆（底盘） */
  stick: Circle;
  /** 右侧菱形四键：A 下 / B 左 / C 上 / D 右 */
  buttons: Record<'A' | 'B' | 'C' | 'D', Circle>;
  /** 底部调试条 */
  bar: { x: number; y: number; w: number; h: number };
}

/** 各控件相对短边的比例（调手感只改这几个数） */
const K = {
  margin: 0.045,
  stickR: 0.17,
  btnR: 0.062,
  /** 菱形中心到每个键的距离 */
  diamond: 0.115,
  barH: 0.052,
};

export function padLayout(width: number, height: number, insets: PadInsets = NO_PAD_INSETS): PadLayout {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const unit = Math.min(w, h);
  const margin = unit * K.margin;

  const stickR = unit * K.stickR;
  const stick: Circle = {
    cx: insets.left + margin + stickR,
    cy: h - insets.bottom - margin - stickR,
    r: stickR,
  };

  const btnR = unit * K.btnR;
  // 菱形中心：右下角，离右/下边各一个"margin + 一个键直径 + 半个间距"
  const dcx = w - insets.right - margin - btnR - unit * K.diamond;
  const dcy = h - insets.bottom - margin - btnR - unit * K.diamond;
  const d = unit * K.diamond;
  const buttons = {
    A: { cx: dcx, cy: dcy + d, r: btnR },
    C: { cx: dcx, cy: dcy - d, r: btnR },
    B: { cx: dcx - d, cy: dcy, r: btnR },
    D: { cx: dcx + d, cy: dcy, r: btnR },
  };

  const barH = unit * K.barH;
  const barW = Math.min(w * 0.62, unit * 1.75);
  const bar = {
    x: (w - barW) / 2,
    y: h - insets.bottom - margin * 1.2 - barH,
    w: barW,
    h: barH,
  };

  return { unit, stick, buttons, bar };
}

/** 两个圆是否重叠（布局自检用） */
export function circlesOverlap(a: Circle, b: Circle): boolean {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r;
}

/** 圆是否完整落在安全区内 */
export function circleInside(c: Circle, width: number, height: number, insets: PadInsets = NO_PAD_INSETS): boolean {
  return (
    c.cx - c.r >= insets.left - 0.5 &&
    c.cy - c.r >= insets.top - 0.5 &&
    c.cx + c.r <= width - insets.right + 0.5 &&
    c.cy + c.r <= height - insets.bottom + 0.5
  );
}
