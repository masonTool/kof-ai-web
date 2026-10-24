import { describe, expect, it } from 'vitest';
import { Btn, makeInput } from '../src/core/input';
import type { CharDef } from '../src/data/schema';
import { GROUND_Y, STAGE_LEFT, STAGE_RIGHT } from '../src/sim/constants';
import { Fighter } from '../src/sim/fighter';
import {
  DEFAULT_PUSH_WIDTH,
  clampStageX,
  integrateAir,
  overlapsPush,
  resolvePush,
  resolvePushAll,
  type PhysicsBody,
  type PushBody,
} from '../src/sim/physics';
import { World } from '../src/sim/world';

const CHAR: CharDef = {
  id: 'test',
  name: '测试',
  palette: { skin: '#e8b48a', hair: '#111', primary: '#222', secondary: '#333', trim: '#fff', accent: '#f44' },
  hp: 1000,
  walk: { fwd: 1, back: 0.8 },
  jump: { vy: 8, vx: 3, frames: 26 },
  boxes: {
    stand: { x: -10, y: -40, w: 20, h: 40 },
    crouch: { x: -10, y: -26, w: 20, h: 26 },
    air: { x: -10, y: -36, w: 20, h: 36 },
  },
  moves: {},
};

function body(over: Partial<PhysicsBody> = {}): PhysicsBody {
  return { x: 100, y: GROUND_Y, vx: 0, vy: 0, airborne: false, ...over };
}

function pusher(x: number, w = 24, airborne = false): PushBody {
  return { x, airborne, pushWidth: w };
}

describe('空中积分', () => {
  it('起跳后上升、到顶点、对称落回地面', () => {
    const b = body({ vy: -8, airborne: true });
    let frame = 0;
    let apexFrame = -1;
    let landed = false;
    while (frame < 200 && !landed) {
      landed = integrateAir(b);
      frame++;
      if (apexFrame < 0 && b.vy >= 0) apexFrame = frame;
    }
    expect(landed).toBe(true);
    expect(b.y).toBe(GROUND_Y);
    expect(b.vy).toBe(0);
    // 8 / 0.65 ≈ 12.3 → 第 13 帧到顶点；上升与下落大致对称
    expect(apexFrame).toBeGreaterThanOrEqual(12);
    expect(apexFrame).toBeLessThanOrEqual(14);
    expect(Math.abs(frame - apexFrame * 2)).toBeLessThanOrEqual(2);
  });

  it('不同起跳速度的滞空时间不同（跳得越高越久）', () => {
    const count = (vy: number): number => {
      const b = body({ vy, airborne: true });
      let frames = 0;
      while (frames < 200 && !integrateAir(b)) frames++;
      return frames;
    };
    expect(count(-6)).toBeLessThan(count(-8));
    expect(count(-8)).toBeLessThan(count(-10));
  });

  it('落地那一帧位置贴回地面，不会陷进去', () => {
    const b = body({ y: GROUND_Y - 1, vy: 5, airborne: true });
    expect(integrateAir(b)).toBe(true);
    expect(b.y).toBe(GROUND_Y);
  });
});

describe('舞台夹取', () => {
  it('左右边界夹住并报告被夹', () => {
    const b = { x: -50 };
    expect(clampStageX(b)).toBe(true);
    expect(b.x).toBe(STAGE_LEFT);

    const c = { x: 999 };
    expect(clampStageX(c)).toBe(true);
    expect(c.x).toBe(STAGE_RIGHT);

    const d = { x: 150 };
    expect(clampStageX(d)).toBe(false);
    expect(d.x).toBe(150);
  });
});

describe('推挤（人不能穿人）', () => {
  it('重叠时对称推开到刚好不重叠', () => {
    const a = pusher(100);
    const b = pusher(110);
    expect(overlapsPush(a, b)).toBe(true);
    expect(resolvePush(a, b)).toBe(true);
    expect(b.x - a.x).toBeCloseTo(24, 5);
    expect(a.x).toBeCloseTo(93, 5);
    expect(b.x).toBeCloseTo(117, 5);
  });

  it('不重叠时不动', () => {
    const a = pusher(100);
    const b = pusher(200);
    expect(resolvePush(a, b)).toBe(false);
    expect([a.x, b.x]).toEqual([100, 200]);
  });

  it('完全重合时按固定方向分开（确定性）', () => {
    const a = pusher(100);
    const b = pusher(100);
    resolvePush(a, b);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x - a.x).toBeCloseTo(24, 5);
  });

  it('一方贴墙时，推不动的部分全压给另一方', () => {
    const a = pusher(STAGE_LEFT);
    const b = pusher(STAGE_LEFT + 12);
    resolvePush(a, b);
    expect(a.x).toBe(STAGE_LEFT);
    expect(b.x - a.x).toBeCloseTo(24, 5);
  });

  it('空中不推（跳过去能过人）', () => {
    const a = pusher(100, 24, true);
    const b = pusher(105);
    expect(resolvePush(a, b)).toBe(false);
    expect([a.x, b.x]).toEqual([100, 105]);
  });

  it('按宽度算中心间距', () => {
    const a = pusher(100, 40);
    const b = pusher(125, 20); // 中心距 25 < (40+20)/2 = 30，算重叠
    expect(overlapsPush(a, b)).toBe(true);
    resolvePush(a, b);
    expect(b.x - a.x).toBeCloseTo(30, 5);
  });
});

describe('Fighter 与物理接线', () => {
  it('跳跃落回地面并回到中立', () => {
    const world = new World(1);
    const f = world.add(new Fighter(CHAR, { x: 100, facing: 1 }));
    world.step([makeInput(Btn.Up)]);
    expect(f.airborne).toBe(true);

    let frames = 0;
    while (f.airborne && frames < 120) {
      world.step([makeInput(0)]);
      frames++;
    }
    expect(f.airborne).toBe(false);
    expect(f.y).toBe(GROUND_Y);
    expect(frames).toBeGreaterThan(10);
    expect(frames).toBeLessThan(40);
  });

  it('撞墙后水平速度清零，不抖动', () => {
    const world = new World(1);
    const f = world.add(new Fighter(CHAR, { x: STAGE_RIGHT - 1, facing: 1 }));
    for (let i = 0; i < 5; i++) world.step([makeInput(Btn.Right)]);
    expect(f.x).toBe(STAGE_RIGHT);
    expect(f.vx).toBe(0);
  });

  it('推挤盒宽度默认 24，可按角色数据覆盖', () => {
    const world = new World(1);
    const f = world.add(new Fighter(CHAR, { x: 100 }));
    expect(f.pushWidth).toBe(DEFAULT_PUSH_WIDTH);
    const wide = world.add(new Fighter({ ...CHAR, push: { w: 40 } }, { x: 140 }));
    expect(wide.pushWidth).toBe(40);
  });

  it('两人相向走不会穿模（每帧推挤）', () => {
    const world = new World(1);
    const a = world.add(new Fighter(CHAR, { x: 100, facing: 1 }));
    const b = world.add(new Fighter(CHAR, { x: 160, facing: -1 }));

    for (let i = 0; i < 120; i++) {
      world.step([makeInput(Btn.Right), makeInput(Btn.Left)]);
      resolvePushAll([a, b]);
    }
    expect(a.x).toBeLessThan(b.x);
    expect(b.x - a.x).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(b.x - a.x).toBeLessThan(26); // 贴住而不是越推越远
  });
});
