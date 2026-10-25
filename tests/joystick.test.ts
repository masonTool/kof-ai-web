import { describe, expect, it } from 'vitest';
import { dirButtons, dirsFromVector, Joystick, NO_DIR, STICK_DEAD_ZONE } from '../src/ui/joystick';
import { circlesOverlap, circleInside, NO_PAD_INSETS, padLayout } from '../src/ui/pad-layout';
import { VirtualPad } from '../src/ui/virtual-pad';

const R = 60;

describe('摇杆方向判定', () => {
  it('死区内不产生方向（手指静止时的抖动不能触发移动）', () => {
    expect(dirsFromVector(0, 0, R)).toEqual(NO_DIR);
    expect(dirsFromVector(R * 0.2, R * 0.15, R)).toEqual(NO_DIR);
  });

  it('推到位就出四个基本方向', () => {
    expect(dirsFromVector(-R * 0.9, 0, R)).toEqual({ ...NO_DIR, left: true });
    expect(dirsFromVector(R * 0.9, 0, R)).toEqual({ ...NO_DIR, right: true });
    expect(dirsFromVector(0, -R * 0.9, R)).toEqual({ ...NO_DIR, up: true });
    expect(dirsFromVector(0, R * 0.9, R)).toEqual({ ...NO_DIR, down: true });
  });

  it('斜方向是两个方向同时成立（←↓ = 蹲防）', () => {
    const d = dirsFromVector(-R * 0.7, R * 0.7, R);
    expect(d.left).toBe(true);
    expect(d.down).toBe(true);
    expect(d.right).toBe(false);
    expect(d.up).toBe(false);
  });

  it('单轴只要不足阈值就不算那个方向（横着推不会误判成上/下）', () => {
    const d = dirsFromVector(R * 0.9, R * 0.25, R);
    expect(d.right).toBe(true);
    expect(d.down).toBe(false); // 0.25 < 阈值 0.36
  });

  it('死区与阈值是相对半径的比例（换手柄尺寸手感不变）', () => {
    const small = dirsFromVector(30 * 0.2, 0, 30);
    const big = dirsFromVector(300 * 0.2, 0, 300);
    expect(small).toEqual(big);
    expect(STICK_DEAD_ZONE).toBeGreaterThan(0);
  });

  it('半径非法时返回"无方向"，不抛异常', () => {
    expect(dirsFromVector(10, 10, 0)).toEqual(NO_DIR);
  });
});

describe('Joystick 状态', () => {
  it('超出手柄范围时按圆周夹紧，方向仍然正确', () => {
    const j = new Joystick();
    j.setCenter(100, 100, 50);
    const d = j.moveTo(500, 100); // 远远推出去
    expect(d.right).toBe(true);
    expect(j.knob.x).toBeCloseTo(50, 5); // 被夹到半径上
    expect(j.knob.y).toBeCloseTo(0, 5);
  });

  it('松手后归零，方向也清掉', () => {
    const j = new Joystick();
    j.setCenter(0, 0, 50);
    j.moveTo(50, 0);
    expect(j.active).toBe(true);
    expect(j.release()).toEqual(NO_DIR);
    expect(j.active).toBe(false);
    expect(j.knob).toEqual({ x: 0, y: 0 });
  });

  it('dirButtons 与方向一一对应', () => {
    expect(dirButtons({ left: true, right: false, up: false, down: true })).toEqual(['left', 'down']);
  });
});

describe('VirtualPad 摇杆接口', () => {
  it('setDirections 原子替换方向；被松开的键最多残留一帧（快速点按不丢输入）', () => {
    const pad = new VirtualPad();
    pad.setDirections(['left', 'down']);
    expect(pad.snapshot().sort()).toEqual(['down', 'left']);

    pad.sampleFrame(); // 走一帧，前面的按下已"存档"
    pad.setDirections(['right']);
    expect(pad.snapshot()).toEqual(['right']);

    // 松开：留在 latched 里补一帧（摇杆快速一点也要能出蹲/走），下一帧就干净了
    pad.setDirections([]);
    expect(pad.snapshot()).toEqual(['right']);
    expect(pad.sampleFrame().held).not.toBe(0);
    expect(pad.snapshot()).toEqual([]);
  });

  it('摇杆设向不影响攻击键（按住 A 的同时推方向）', () => {
    const pad = new VirtualPad();
    pad.press('A');
    pad.setDirections(['right']);
    expect(pad.snapshot().sort()).toEqual(['A', 'right']);
    pad.setDirections([]);
    pad.sampleFrame();
    expect(pad.snapshot()).toEqual(['A']); // 方向清掉，A 还按着
  });

  it('方向快速换向不会丢输入（每次变化都走 press）', () => {
    const pad = new VirtualPad();
    pad.setDirections(['right']);
    pad.sampleFrame();
    pad.setDirections(['left']);
    const s = pad.sampleFrame();
    expect(pad.snapshot()).toContain('left');
    expect(s.held).not.toBe(0);
  });
});

describe('手台布局（按屏幕短边取比例）', () => {
  const sizes = [
    [1280, 720],
    [390, 844],
    [844, 390],
    [2560, 1440],
  ] as const;

  it('所有控件都在屏幕内（不留出界的按钮）', () => {
    for (const [w, h] of sizes) {
      const l = padLayout(w, h);
      expect(circleInside(l.stick, w, h), `${w}x${h} 摇杆`).toBe(true);
      for (const key of ['A', 'B', 'C', 'D'] as const) {
        expect(circleInside(l.buttons[key], w, h), `${w}x${h} ${key}`).toBe(true);
      }
    }
  });

  it('摇杆与攻击键不重叠，四键之间也不重叠', () => {
    for (const [w, h] of sizes) {
      const l = padLayout(w, h);
      const ks = [l.buttons.A, l.buttons.B, l.buttons.C, l.buttons.D];
      expect(circlesOverlap(l.stick, l.buttons.A), `${w}x${h}`).toBe(false);
      for (let i = 0; i < ks.length; i++) {
        for (let j = i + 1; j < ks.length; j++) {
          expect(circlesOverlap(ks[i]!, ks[j]!), `${w}x${h} ${i}-${j}`).toBe(false);
        }
      }
    }
  });

  it('控件尺寸随短边等比缩放（手机和平板手感一致）', () => {
    const phone = padLayout(844, 390);
    const pad = padLayout(2560, 1440);
    const phoneRatio = phone.stick.r / Math.min(844, 390);
    const padRatio = pad.stick.r / Math.min(2560, 1440);
    expect(phoneRatio).toBeCloseTo(padRatio, 5);
  });

  it('菱形：A 在下、C 在上、B 在左、D 在右', () => {
    const l = padLayout(1280, 720);
    expect(l.buttons.A.cy).toBeGreaterThan(l.buttons.C.cy);
    expect(l.buttons.B.cx).toBeLessThan(l.buttons.D.cx);
    expect(l.buttons.A.cx).toBeCloseTo(l.buttons.C.cx, 5);
  });

  it('横向安全区会把控件往中间挤，不会压到刘海', () => {
    const insets = { top: 0, right: 44, bottom: 21, left: 44 };
    const l = padLayout(844, 390, insets);
    expect(l.stick.cx - l.stick.r).toBeGreaterThanOrEqual(44 - 0.5);
    expect(l.buttons.D.cx + l.buttons.D.r).toBeLessThanOrEqual(844 - 44 + 0.5);
    expect(l.stick.cy + l.stick.r).toBeLessThanOrEqual(390 - 21 + 0.5);
  });

  it('极端窄屏也不产生负数或重叠（保证能点）', () => {
    const l = padLayout(320, 240, NO_PAD_INSETS);
    expect(l.stick.r).toBeGreaterThan(4);
    expect(circlesOverlap(l.stick, l.buttons.B)).toBe(false);
  });
});

describe('手台自定义位置', () => {
  it('自定义点覆盖默认圆心，半径不变（手感一致）', () => {
    const base = padLayout(844, 390);
    const moved = padLayout(844, 390, NO_PAD_INSETS, { A: { x: 0.2, y: 0.3 } });
    expect(moved.buttons.A.cx).toBeCloseTo(844 * 0.2, 0);
    expect(moved.buttons.A.cy).toBeCloseTo(390 * 0.3, 0);
    expect(moved.buttons.A.r).toBeCloseTo(base.buttons.A.r, 5);
    // 没被改的控件保持默认
    expect(moved.stick).toEqual(base.stick);
  });

  it('拖到屏幕外会被夹回安全区内（不会变成点不到的按钮）', () => {
    const l = padLayout(
      844,
      390,
      { top: 0, right: 40, bottom: 20, left: 40 },
      { stick: { x: 0, y: 0 }, D: { x: 1, y: 1 } },
    );
    expect(l.stick.cx - l.stick.r).toBeGreaterThanOrEqual(40 - 0.5);
    expect(l.stick.cy - l.stick.r).toBeGreaterThanOrEqual(-0.5);
    expect(l.buttons.D.cx + l.buttons.D.r).toBeLessThanOrEqual(844 - 40 + 0.5);
    expect(l.buttons.D.cy + l.buttons.D.r).toBeLessThanOrEqual(390 - 20 + 0.5);
  });

  it('归一化坐标：同一份设置在手机和平板上都落在相同相对位置', () => {
    const custom = { B: { x: 0.75, y: 0.8 } };
    const phone = padLayout(844, 390, NO_PAD_INSETS, custom);
    const pad = padLayout(2560, 1440, NO_PAD_INSETS, custom);
    expect(phone.buttons.B.cx / 844).toBeCloseTo(pad.buttons.B.cx / 2560, 3);
    expect(phone.buttons.B.cy / 390).toBeCloseTo(pad.buttons.B.cy / 1440, 3);
  });
});
