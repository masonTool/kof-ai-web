import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { KYO } from '../src/data/chars/kyo';
import { Fighter } from '../src/sim/fighter';
import { FighterState } from '../src/sim/state';
import { World } from '../src/sim/world';
import { resolveCombat } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';

const D = Btn.Down;
const U = Btn.Up;
const L = Btn.Left;
const R = Btn.Right;

interface Arena {
  world: World;
  p1: Fighter;
  p2: Fighter;
  /** 喂一帧 P1 输入（P2 不动） */
  step(held: number): void;
}

function arena(gap = 40): Arena {
  const world = new World(1);
  const p1 = world.add(new Fighter(KYO, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(KYO, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const fighters = [p1, p2];
  const step = (held: number): void => {
    world.step([{ held }, { held: 0 }]);
    resolveCombat(world, fighters);
    resolvePushAll(fighters);
  };
  step(0); // 第一帧建立基线，之后按下的键才是"本帧按下"
  return { world, p1, p2, step };
}

/** 依次喂方向帧，最后一帧同时按下按键 */
function press(a: Arena, frames: number[], buttons: number): void {
  for (let i = 0; i < frames.length; i++) {
    const last = i === frames.length - 1;
    a.step(frames[i]! | (last ? buttons : 0));
  }
}

describe('通常技：按哪个键出哪招', () => {
  it('站姿 A/B/C/D → 5A/5B/5C/5D', () => {
    const map: [number, string][] = [
      [Btn.A, '5A'],
      [Btn.B, '5B'],
      [Btn.C, '5C'],
      [Btn.D, '5D'],
    ];
    for (const [btn, id] of map) {
      const a = arena();
      a.step(btn);
      expect(a.p1.move?.id, id).toBe(id);
      expect(a.p1.state).toBe(FighterState.Attack);
    }
  });

  it('蹲下 → 2A/2B/2C/2D', () => {
    const map: [number, string][] = [
      [Btn.A, '2A'],
      [Btn.B, '2B'],
      [Btn.C, '2C'],
      [Btn.D, '2D'],
    ];
    for (const [btn, id] of map) {
      const a = arena();
      a.step(D); // 先蹲下
      a.step(D | btn);
      expect(a.p1.move?.id, id).toBe(id);
    }
  });

  it('空中 → jA/jB/jC/jD', () => {
    for (const [btn, id] of [
      [Btn.A, 'jA'],
      [Btn.B, 'jB'],
      [Btn.C, 'jC'],
      [Btn.D, 'jD'],
    ] as [number, string][]) {
      const a = arena();
      a.step(U); // 起跳
      a.step(0);
      a.step(btn);
      expect(a.p1.move?.id, id).toBe(id);
    }
  });

  it('按住上再按攻击不会出地面招（先起跳）', () => {
    const a = arena();
    a.step(U | Btn.A);
    expect(a.p1.move).toBeNull();
    expect(a.p1.airborne).toBe(true);
  });

  it('同帧 C+D → 吹飞攻击，而不是 5D', () => {
    const a = arena();
    a.step(Btn.C | Btn.D);
    expect(a.p1.move?.id).toBe('CD');
  });

  it('出招中再按普通攻击不会打断（还没命中就没取消）', () => {
    const a = arena(200); // 打不到人
    a.step(Btn.C);
    expect(a.p1.move?.id).toBe('5C');
    a.step(0);
    a.step(0);
    a.step(Btn.A);
    expect(a.p1.move?.id).toBe('5C');
  });
});

describe('必杀技：指令真的能出招', () => {
  it('236+A / 236+C / 623+A / 214+D / 421+B', () => {
    const cases: [number[], number, string][] = [
      [[D, D | R, R], Btn.A, '236A'],
      [[D, D | R, R], Btn.C, '236C'],
      [[R, D, D | R], Btn.A, '623P'],
      [[D, D | L, L], Btn.D, '214K'],
      [[L, D, D | L], Btn.B, '421K'],
    ];
    for (const [frames, btn, id] of cases) {
      const a = arena();
      press(a, frames, btn);
      expect(a.p1.move?.id, id).toBe(id);
    }
  });

  it('指令不完整就不出必杀（退化成通常技）', () => {
    const a = arena();
    press(a, [D], Btn.A); // 只有 ↓ 就按 A
    expect(a.p1.move?.id).toBe('2A');
  });

  it('指令通常技 3D / 6B', () => {
    const a = arena();
    press(a, [D | R], Btn.D);
    expect(a.p1.move?.id).toBe('3D');

    const b = arena();
    press(b, [R], Btn.B);
    expect(b.p1.move?.id).toBe('6B');
  });
});

describe('超必杀与气槽', () => {
  it('气够 → 236236+A 出大蛇薙并扣 50 气', () => {
    const a = arena();
    a.p1.meter = 100;
    press(a, [D, D | R, R, D, D | R, R], Btn.A);
    expect(a.p1.move?.id).toBe('236236P');
    expect(a.p1.meter).toBe(50);
  });

  it('气不够 → 不出超必杀，退化成荒咬', () => {
    const a = arena();
    a.p1.meter = 10;
    press(a, [D, D | R, R, D, D | R, R], Btn.A);
    expect(a.p1.move?.id).toBe('236A');
    expect(a.p1.meter).toBe(10);
  });

  it('无式的同帧双键（A+C）', () => {
    const a = arena();
    a.p1.meter = 100;
    press(a, [D, D | R, R, D, D | R, R], Btn.A | Btn.C);
    expect(a.p1.move?.id).toBe('236236AC');
    expect(a.p1.meter).toBe(0);
  });
});

describe('投技：只有贴身才成立', () => {
  it('贴身 6+C 是投技', () => {
    const a = arena(36);
    press(a, [R], Btn.C);
    expect(a.p1.move?.id).toBe('throw');
  });

  it('离得远 6+C 退化成 5C', () => {
    const a = arena(200);
    press(a, [R], Btn.C);
    expect(a.p1.move?.id).toBe('5C');
  });

  it('对手在空中时抓不到', () => {
    const a = arena(36);
    a.p2.startJump(0);
    a.step(0);
    press(a, [R], Btn.C);
    expect(a.p1.move?.id).toBe('5C');
  });
});

describe('取消（连段）', () => {
  it('5C 命中后能取消进 236A', () => {
    const a = arena(40);
    a.step(Btn.C);
    expect(a.p1.move?.id).toBe('5C');

    // 走到命中帧（判定 8~11）
    for (let i = 0; i < 12 && a.p2.hp === a.p2.maxHp; i++) a.step(0);
    expect(a.p2.hp).toBeLessThan(a.p2.maxHp);
    expect(a.p1.canCancelInto('236A')).toBe(true);

    press(a, [D, D | R, R], Btn.A);
    // 命中停顿里按下的指令会缓存，解冻那一帧才生效
    for (let i = 0; i < 12 && a.p1.move?.id !== '236A'; i++) a.step(0);
    expect(a.p1.move?.id).toBe('236A');
  });

  it('打空就不能取消，招式照常收尾', () => {
    const a = arena(200);
    a.step(Btn.C);
    for (let i = 0; i < 10; i++) a.step(0);
    expect(a.p1.canCancelInto('236A')).toBe(false);
    press(a, [D, D | R, R], Btn.A);
    expect(a.p1.move?.id).toBe('5C');
  });

  it('取消之后恢复中立会关掉取消窗口', () => {
    const a = arena(40);
    a.step(Btn.C);
    for (let i = 0; i < 12 && a.p2.hp === a.p2.maxHp; i++) a.step(0);
    press(a, [D, D | R, R], Btn.A);
    for (let i = 0; i < 12 && a.p1.move?.id !== '236A'; i++) a.step(0);
    expect(a.p1.move?.id).toBe('236A');
    for (let i = 0; i < 120 && a.p1.isAttacking; i++) a.step(0);
    expect(a.p1.isAttacking).toBe(false);
    expect(a.p1.cancelSet).toBeNull();
  });
});
