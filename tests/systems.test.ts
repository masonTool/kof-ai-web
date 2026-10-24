import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { KYO } from '../src/data/chars/kyo';
import { Fighter } from '../src/sim/fighter';
import { resolveCombat } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { GROUND_Y, GUARD_CRUSH_STUN, MAX_MODE_DAMAGE, MAX_MODE_FRAMES } from '../src/sim/constants';
import { FighterState } from '../src/sim/state';
import { World } from '../src/sim/world';

const U = Btn.Up;
const L = Btn.Left;
const R = Btn.Right;

interface Arena {
  world: World;
  p1: Fighter;
  p2: Fighter;
  step(held: number, held2?: number): void;
}

function arena(gap = 40): Arena {
  const world = new World(7);
  const p1 = world.add(new Fighter(KYO, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(KYO, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const fighters = [p1, p2];
  const step = (held: number, held2 = 0): void => {
    world.step([{ held }, { held: held2 }]);
    resolveCombat(world, fighters);
    resolvePushAll(fighters);
  };
  step(0);
  return { world, p1, p2, step };
}

/** 起跳后按住↑ N 帧再松手，返回 { 最高点, 滞空帧数 } */
function jumpTrace(upFrames: number): { apex: number; airFrames: number } {
  const a = arena();
  let apex = GROUND_Y;
  let airFrames = 0;
  a.step(U);
  for (let i = 0; i < 200; i++) {
    a.step(i < upFrames ? U : 0);
    apex = Math.min(apex, a.p1.y);
    if (a.p1.airborne) airFrames++;
    else break;
  }
  return { apex, airFrames };
}

describe('跳跃体系', () => {
  it('轻点↑是小跳、按住↑是大跳', () => {
    const tap = jumpTrace(2);
    const hold = jumpTrace(20);
    expect(hold.apex).toBeLessThan(tap.apex); // y 越小 = 跳得越高
    expect(tap.apex - hold.apex).toBeGreaterThan(10);
  });

  it('小跳滞空比大跳短', () => {
    expect(jumpTrace(2).airFrames).toBeLessThan(jumpTrace(20).airFrames);
  });

  it('前跳/后跳/垂直跳的方向', () => {
    const fwd = arena();
    const x0 = fwd.p1.x;
    fwd.step(U | R);
    for (let i = 0; i < 20; i++) fwd.step(R);
    expect(fwd.p1.x).toBeGreaterThan(x0);

    const back = arena();
    const x1 = back.p1.x;
    back.step(U | L);
    for (let i = 0; i < 20; i++) back.step(L);
    expect(back.p1.x).toBeLessThan(x1);

    const up = arena();
    const x2 = up.p1.x;
    up.step(U);
    for (let i = 0; i < 10; i++) up.step(0);
    expect(Math.abs(up.p1.x - x2)).toBeLessThan(1);
  });
});

describe('紧急回避 AB', () => {
  it('A+B 同帧出回避，并产生位移', () => {
    const a = arena();
    const x0 = a.p1.x;
    a.step(Btn.A | Btn.B);
    expect(a.p1.move?.id).toBe('AB');
    for (let i = 0; i < 26; i++) a.step(0);
    expect(Math.abs(a.p1.x - x0)).toBeGreaterThan(40);
    expect(a.p1.state).toBe(FighterState.Idle); // 结束后回中立
  });

  it('按住后是后转、按住前是前转', () => {
    const back = arena();
    const x0 = back.p1.x;
    back.step(Btn.A | Btn.B | L);
    for (let i = 0; i < 24; i++) back.step(0);
    expect(back.p1.x).toBeLessThan(x0);

    const fwd = arena();
    const x1 = fwd.p1.x;
    fwd.step(Btn.A | Btn.B | R);
    for (let i = 0; i < 24; i++) fwd.step(0);
    expect(fwd.p1.x).toBeGreaterThan(x1);
  });

  it('回避途中打不到（无敌帧生效）', () => {
    const a = arena(40);
    a.step(Btn.A | Btn.B);
    expect(a.p1.move?.id).toBe('AB');
    // 对方在回避的无敌窗口里出重拳
    a.p2.startMove(KYO.moves['5C']!);
    for (let i = 0; i < 24; i++) a.step(0);
    expect(a.p1.hp).toBe(a.p1.maxHp);
  });

  it('普通出招时并不无敌（对照组）', () => {
    const a = arena(40);
    a.p1.startMove(KYO.moves['5C']!);
    a.p2.startMove(KYO.moves['5C']!);
    for (let i = 0; i < 24; i++) a.step(0);
    expect(a.p1.hp).toBeLessThan(a.p1.maxHp);
  });
});

describe('受身（倒地快速起身）', () => {
  it('倒地后按 AB 会提前站起来', () => {
    const normal = arena(40);
    normal.p2.startMove(KYO.moves['2D']!); // 扫腿击倒
    for (let i = 0; i < 30 && normal.p1.state !== FighterState.Down; i++) normal.step(0);
    expect(normal.p1.state).toBe(FighterState.Down);
    let normalFrames = 0;
    while (normal.p1.state === FighterState.Down && normalFrames < 60) {
      normal.step(0);
      normalFrames++;
    }

    const quick = arena(40);
    quick.p2.startMove(KYO.moves['2D']!);
    for (let i = 0; i < 30 && quick.p1.state !== FighterState.Down; i++) quick.step(0);
    let quickFrames = 0;
    while (quick.p1.state === FighterState.Down && quickFrames < 60) {
      // 前 5 帧等最短受身时间，然后按一次 AB
      quick.step(quickFrames === 5 ? Btn.A | Btn.B : 0);
      quickFrames++;
    }
    expect(quickFrames).toBeLessThan(normalFrames);
  });
});

describe('削防（连续防御 → 崩防）', () => {
  it('一直防会累积削防值，累积满就崩防进硬直', () => {
    const a = arena(40);
    let crushed = false;
    for (let round = 0; round < 12 && !crushed; round++) {
      a.p1.x = 200;
      a.p2.x = 240;
      a.p2.startMove(KYO.moves['5C']!);
      for (let i = 0; i < 20; i++) {
        a.step(L); // P1 按住后退 = 防御
        if (a.p1.state === FighterState.Hit) crushed = true;
        if (a.p1.state === FighterState.Idle && i > 12) break;
      }
    }
    expect(crushed).toBe(true);
  });

  it('不防御时削防值不会累积', () => {
    const a = arena(40);
    a.p2.startMove(KYO.moves['5B']!);
    for (let i = 0; i < 20; i++) a.step(0);
    expect(a.p1.guardGauge).toBe(0);
    expect(a.p1.state).not.toBe(FighterState.Block);
  });
});

describe('气绝（晕眩）', () => {
  it('晕眩值攒满会进晕眩，晕眩中挨打不再累积', () => {
    const a = arena(40);
    a.p1.stunGauge = 96;
    a.p2.startMove(KYO.moves['5C']!);
    for (let i = 0; i < 20 && a.p1.state !== FighterState.Dizzy; i++) a.step(0);
    expect(a.p1.state).toBe(FighterState.Dizzy);
    expect(a.p1.stunGauge).toBe(0);
  });

  it('晕眩中连按按键能提前醒', () => {
    const slow = arena(40);
    slow.p1.enterDizzy(60);
    let slowFrames = 0;
    while (slow.p1.state === FighterState.Dizzy && slowFrames < 120) {
      slow.step(0);
      slowFrames++;
    }

    const fast = arena(40);
    fast.p1.enterDizzy(60);
    let fastFrames = 0;
    while (fast.p1.state === FighterState.Dizzy && fastFrames < 120) {
      fast.step(Btn.A); // 每帧都有按下边沿
      fastFrames++;
    }
    expect(fastFrames).toBeLessThan(slowFrames);
  });
});

describe('MAX 模式', () => {
  it('气满时 ABC 启动，扣一条气', () => {
    const a = arena();
    a.p1.meter = 100;
    a.step(Btn.A | Btn.B | Btn.C);
    expect(a.p1.maxMode).toBeGreaterThan(0);
    expect(a.p1.meter).toBe(0);
  });

  it('气不够启动不了', () => {
    const a = arena();
    a.p1.meter = 60;
    a.step(Btn.A | Btn.B | Btn.C);
    expect(a.p1.maxMode).toBe(0);
    expect(a.p1.meter).toBe(60);
  });

  it('MAX 模式期间伤害更高', () => {
    const plain = arena(40);
    plain.p2.startMove(KYO.moves['5C']!);
    for (let i = 0; i < 20 && plain.p1.hp === plain.p1.maxHp; i++) plain.step(0);

    const boosted = arena(40);
    boosted.p2.maxMode = MAX_MODE_FRAMES;
    boosted.p2.startMove(KYO.moves['5C']!);
    for (let i = 0; i < 20 && boosted.p1.hp === boosted.p1.maxHp; i++) boosted.step(0);

    const plainDmg = plain.p1.maxHp - plain.p1.hp;
    const boostedDmg = boosted.p1.maxHp - boosted.p1.hp;
    expect(boostedDmg).toBe(Math.round(plainDmg * MAX_MODE_DAMAGE));
  });

  it('MAX 模式会到期', () => {
    const a = arena();
    a.p1.maxMode = 5;
    for (let i = 0; i < 6; i++) a.step(0);
    expect(a.p1.maxMode).toBe(0);
  });
});

describe('防御取消 CD', () => {
  it('防御硬直中按 CD 能反击出去', () => {
    const a = arena(40);
    // 先让 P1 进入防御（挨一下但不掉血）
    a.p2.startMove(KYO.moves['5B']!);
    a.step(L);
    for (let i = 0; i < 12 && a.p1.state !== FighterState.Block; i++) a.step(L);
    expect(a.p1.state).toBe(FighterState.Block);

    a.step(L | Btn.C | Btn.D);
    expect(a.p1.move?.id).toBe('CD');
    expect(a.p1.state).toBe(FighterState.Attack);
  });

  it('非防御状态下 CD 是普通吹飞', () => {
    const a = arena();
    a.step(Btn.C | Btn.D);
    expect(a.p1.move?.id).toBe('CD');
  });
});

describe('系统机制不破坏确定性', () => {
  it('同输入同哈希', () => {
    const run = (): string => {
      const a = arena();
      const script: number[] = [];
      for (let i = 0; i < 200; i++) {
        script.push(i % 40 === 0 ? Btn.A | Btn.B : i % 33 === 0 ? U : i % 17 === 0 ? Btn.C | Btn.D : 0);
      }
      for (const held of script) a.step(held);
      return a.world.hash();
    };
    expect(run()).toBe(run());
  });

  it('崩防后的硬直够长', () => {
    expect(GUARD_CRUSH_STUN).toBeGreaterThan(20);
  });
});
