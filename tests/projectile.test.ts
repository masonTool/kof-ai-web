import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { IORI } from '../src/data/chars/iori';
import { Fighter } from '../src/sim/fighter';
import { resolveCombat, resolveProjectiles } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { Projectile } from '../src/sim/projectile';
import { FighterState } from '../src/sim/state';
import { World } from '../src/sim/world';
import { Match } from '../src/game/match';
import { KYO } from '../src/data/chars/kyo';
import { drawFrame } from '../src/render/renderer';
import { FakeCtx } from './helpers/fake-ctx';

const D = Btn.Down;
const R = Btn.Right;
const L = Btn.Left;

interface Arena {
  world: World;
  p1: Fighter;
  p2: Fighter;
  step(held: number, held2?: number): void;
  projectiles(): Projectile[];
}

function arena(gap = 120): Arena {
  const world = new World(11);
  const p1 = world.add(new Fighter(IORI, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(IORI, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const fighters = [p1, p2];
  const step = (held: number, held2 = 0): void => {
    world.step([{ held }, { held: held2 }]);
    resolveCombat(world, fighters);
    resolveProjectiles(world, fighters);
    resolvePushAll(fighters);
    world.sweep();
  };
  step(0);
  return {
    world,
    p1,
    p2,
    step,
    projectiles: () => world.entities.filter((e): e is Projectile => e instanceof Projectile),
  };
}

/** 摇 236 + A（闇払い）；朝左的人要用镜像方向 */
function fire(a: Arena, who: 1 | 2 = 1): void {
  const frames = who === 1 ? [D, D | R, R | Btn.A] : [D, D | L, L | Btn.A];
  for (const held of frames) {
    if (who === 1) a.step(held);
    else a.step(0, held);
  }
}

describe('飞行道具：生成与飞行', () => {
  it('出闇払い会在身前生成一个道具', () => {
    const a = arena();
    fire(a);
    expect(a.p1.move?.id).toBe('236A');
    for (let i = 0; i < 12 && a.projectiles().length === 0; i++) a.step(0);
    const list = a.projectiles();
    expect(list.length).toBe(1);
    expect(list[0]!.owner).toBe(a.p1);
    expect(list[0]!.vx).toBeGreaterThan(0);
    expect(list[0]!.x).toBeGreaterThan(a.p1.x);
  });

  it('每帧按速度前飞', () => {
    const a = arena();
    fire(a);
    for (let i = 0; i < 12 && a.projectiles().length === 0; i++) a.step(0);
    const p = a.projectiles()[0]!;
    const x0 = p.x;
    a.step(0);
    expect(p.x - x0).toBeCloseTo(p.vx, 5);
  });

  it('朝左的角色放出来的道具往左飞', () => {
    const a = arena();
    a.p2.facing = -1;
    fire(a, 2);
    for (let i = 0; i < 16 && a.projectiles().length === 0; i++) a.step(0);
    const list = a.projectiles();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.vx).toBeLessThan(0);
  });

  it('存活帧数到点会消失', () => {
    const a = arena(400);
    fire(a);
    for (let i = 0; i < 12 && a.projectiles().length === 0; i++) a.step(0);
    const p = a.projectiles()[0]!;
    p.life = 3;
    for (let i = 0; i < 5; i++) a.step(0);
    expect(a.projectiles()).toHaveLength(0);
  });
});

describe('飞行道具：命中', () => {
  it('打到人会掉血，道具消失', () => {
    const a = arena(120);
    fire(a);
    for (let i = 0; i < 60 && a.p2.hp === a.p2.maxHp; i++) a.step(0);
    expect(a.p2.hp).toBeLessThan(a.p2.maxHp);
    expect(a.projectiles()).toHaveLength(0);
  });

  it('打到人会进受击硬直（闇払い会击倒）', () => {
    const a = arena(120);
    fire(a);
    let sawHit = false;
    for (let i = 0; i < 60; i++) {
      a.step(0);
      if (a.p2.state === FighterState.Hit) sawHit = true;
    }
    expect(sawHit || a.p2.state === FighterState.Down).toBe(true);
  });

  it('按住后退能防住，不掉血', () => {
    const a = arena(120);
    fire(a);
    // P2 面朝左 → 后退方向是右
    for (let i = 0; i < 60 && a.p2.state !== FighterState.Block; i++) a.step(0, R);
    expect(a.p2.state).toBe(FighterState.Block);
    expect(a.p2.hp).toBe(a.p2.maxHp);
  });

  it('放道具的角色自己不会被自己的道具打到', () => {
    const a = arena(120);
    fire(a);
    for (let i = 0; i < 40; i++) a.step(0);
    expect(a.p1.hp).toBe(a.p1.maxHp);
  });
});

describe('飞行道具：相撞', () => {
  it('两人的道具撞上会同归于尽', () => {
    const a = arena(200);
    // 两边同时摇 236+A
    const p1Frames = [D, D | R, R | Btn.A];
    const p2Frames = [D, D | L, L | Btn.A];
    for (let i = 0; i < 3; i++) a.step(p1Frames[i]!, p2Frames[i]!);
    for (let i = 0; i < 20 && a.projectiles().length < 2; i++) a.step(0);
    expect(a.projectiles().length).toBe(2);

    let clashed = false;
    for (let i = 0; i < 40 && a.projectiles().length > 0; i++) {
      a.step(0);
      if (a.projectiles().length === 0) clashed = true;
    }
    expect(clashed).toBe(true);
    // 相撞不算命中，双方都不掉血
    expect(a.p1.hp).toBe(a.p1.maxHp);
    expect(a.p2.hp).toBe(a.p2.maxHp);
  });
});

describe('飞行道具：确定性', () => {
  it('同输入两次跑哈希一致', () => {
    const run = (): string => {
      const a = arena(160);
      for (let i = 0; i < 30; i++) {
        const held = i < 3 ? [D, D | R, R | Btn.A][i]! : 0;
        a.step(held);
      }
      return a.world.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('飞行道具：渲染', () => {
  it('画面里能画出道具（arc 调用）', () => {
    const m = new Match(IORI, KYO, { introFrames: 1, roundEndFrames: 3 }, 21);
    m.phase = 'fight';
    m.p1.startMove(IORI.moves['236A']!);
    for (let i = 0; i < 20; i++) m.step();

    const ctx = new FakeCtx();
    expect(() => drawFrame(ctx, m)).not.toThrow();
    // 角色现在是像素块画的（大量 fillRect），道具仍用圆弧画
    expect(ctx.count('arc')).toBeGreaterThanOrEqual(2);
    expect(ctx.rects.length).toBeGreaterThan(50);
  });
});
