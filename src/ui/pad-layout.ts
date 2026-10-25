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

/**
 * 自定义位置：归一化到 0~1（相对屏幕宽高）。
 *
 * 存归一化值而不是像素，是因为同一份设置要在手机和平板上都能用——
 * 存 px 的话，换台设备就跑到屏幕外了。
 */
export interface PadPoint {
  x: number;
  y: number;
}

export type PadControlId = 'stick' | 'A' | 'B' | 'C' | 'D';

/** 只存被改过的控件；空对象 = 全默认 */
export type PadCustom = Partial<Record<PadControlId, PadPoint>>;

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

/** 把圆夹回安全区内（自定义位置拖到屏幕外时兜住） */
export function clampCircle(c: Circle, width: number, height: number, insets: PadInsets = NO_PAD_INSETS): Circle {
  const minX = insets.left + c.r;
  const maxX = width - insets.right - c.r;
  const minY = insets.top + c.r;
  const maxY = height - insets.bottom - c.r;
  return {
    ...c,
    // 屏幕比按钮还窄时 minX > maxX，取中间，避免出现负数位置
    cx: maxX < minX ? (minX + maxX) / 2 : Math.min(Math.max(c.cx, minX), maxX),
    cy: maxY < minY ? (minY + maxY) / 2 : Math.min(Math.max(c.cy, minY), maxY),
  };
}

export function padLayout(
  width: number,
  height: number,
  insets: PadInsets = NO_PAD_INSETS,
  custom: PadCustom = {},
): PadLayout {
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

  // 自定义位置：覆盖圆心，半径仍按比例（手感一致），最后夹进安全区
  const applyCustom = (id: PadControlId, c: Circle): Circle => {
    const pt = custom[id];
    if (!pt) return c;
    return clampCircle({ cx: pt.x * w, cy: pt.y * h, r: c.r }, w, h, insets);
  };

  const barH = unit * K.barH;
  const barW = Math.min(w * 0.62, unit * 1.75);
  const bar = {
    x: (w - barW) / 2,
    y: h - insets.bottom - margin * 1.2 - barH,
    w: barW,
    h: barH,
  };

  return {
    unit,
    stick: applyCustom('stick', stick),
    buttons: {
      A: applyCustom('A', buttons.A),
      B: applyCustom('B', buttons.B),
      C: applyCustom('C', buttons.C),
      D: applyCustom('D', buttons.D),
    },
    bar,
  };
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
