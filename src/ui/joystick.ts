/**
 * 虚拟摇杆的方向判定（纯逻辑，不碰 DOM，可在 node 里测）。
 *
 * 为什么不用"角度切片"：格斗游戏里斜方向是**组合输入**（←+↓ = 蹲防），
 * 角度切片会让手抖两度就从"防御"变成"蹲防"，实战非常难受。
 * 这里用**双轴阈值**：横轴超过阈值就算 ←/→，纵轴超过阈值就算 ↑/↓，两者可以同时成立，
 * 正好得到 8 向；死区内一律不产生方向，避免手指静止时的抖动。
 */

/** 死区：相对摇杆半径的比例。小于它就认为"没推" */
export const STICK_DEAD_ZONE = 0.3;
/** 单轴阈值：相对半径的比例。超过它才算这个方向被推到了 */
export const STICK_AXIS_THRESHOLD = 0.36;

export interface Dir4 {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export const NO_DIR: Dir4 = { left: false, right: false, up: false, down: false };

/**
 * 由摇杆向量算方向。
 *
 * @param dx 触点到摇杆中心的横向偏移（向右为正）
 * @param dy 纵向偏移（**向下为正**，和屏幕坐标一致）
 * @param radius 摇杆半径
 */
export function dirsFromVector(dx: number, dy: number, radius: number, deadZone = STICK_DEAD_ZONE): Dir4 {
  if (!(radius > 0)) return { ...NO_DIR };
  const dist = Math.hypot(dx, dy);
  if (dist < radius * deadZone) return { ...NO_DIR };
  const ax = Math.abs(dx) / radius;
  const ay = Math.abs(dy) / radius;
  return {
    left: ax >= STICK_AXIS_THRESHOLD && dx < 0,
    right: ax >= STICK_AXIS_THRESHOLD && dx > 0,
    up: ay >= STICK_AXIS_THRESHOLD && dy < 0,
    down: ay >= STICK_AXIS_THRESHOLD && dy > 0,
  };
}

/** 方向 → 按键名（供 VirtualPad.setDirections 用） */
export function dirButtons(d: Dir4): Array<'left' | 'right' | 'up' | 'down'> {
  const out: Array<'left' | 'right' | 'up' | 'down'> = [];
  if (d.left) out.push('left');
  if (d.right) out.push('right');
  if (d.up) out.push('up');
  if (d.down) out.push('down');
  return out;
}

/**
 * 摇杆状态：记住中心与半径，把触点位置换算成方向。
 *
 * UI 需要画"摇杆头"，所以这里除了方向还提供 `knob`（相对中心的偏移，已夹在半径内）。
 */
export class Joystick {
  centerX = 0;
  centerY = 0;
  radius = 60;
  private dx = 0;
  private dy = 0;

  get active(): boolean {
    return this.dx !== 0 || this.dy !== 0;
  }

  /** 摇杆头相对中心的偏移（已按半径夹紧） */
  get knob(): { x: number; y: number } {
    return { x: this.dx, y: this.dy };
  }

  setCenter(x: number, y: number, radius: number): void {
    this.centerX = x;
    this.centerY = y;
    this.radius = Math.max(1, radius);
  }

  /** 触点移动；返回当前方向（调用方拿去更新 VirtualPad） */
  moveTo(px: number, py: number): Dir4 {
    let dx = px - this.centerX;
    let dy = py - this.centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > this.radius) {
      // 超出手柄范围就贴着圆周走，方向和幅度都不失真
      dx = (dx / dist) * this.radius;
      dy = (dy / dist) * this.radius;
    }
    this.dx = dx;
    this.dy = dy;
    return dirsFromVector(dx, dy, this.radius);
  }

  /** 松手：清零并返回"没有方向" */
  release(): Dir4 {
    this.dx = 0;
    this.dy = 0;
    return { ...NO_DIR };
  }
}
