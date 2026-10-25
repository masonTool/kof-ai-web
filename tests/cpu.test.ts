import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { CpuBrain, CPU_LEVELS, CPU_PROFILES, type CpuLevel } from '../src/ai/cpu';
import { KYO } from '../src/data/chars/kyo';
import { IORI } from '../src/data/chars/iori';
import { Fighter } from '../src/sim/fighter';
import { resolveCombat } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { World } from '../src/sim/world';

interface Arena {
  world: World;
  p1: Fighter;
  p2: Fighter;
  step(held1: number, held2: number): void;
}

function arena(gap = 96): Arena {
  const world = new World(31);
  const p1 = world.add(new Fighter(KYO, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(KYO, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const fighters = [p1, p2];
  const step = (held1: number, held2: number): void => {
    world.step([{ held: held1 }, { held: held2 }]);
    resolveCombat(world, fighters);
    resolvePushAll(fighters);
  };
  step(0, 0);
  return { world, p1, p2, step };
}

/** 对手出招后，CPU 多少帧才按住后退（防御）；一直不防返回 999 */
function framesUntilGuard(level: CpuLevel, seed: number): number {
  const a = arena();
  a.p1.startMove(KYO.moves['5C']!);
  const brain = new CpuBrain(a.p2, a.p1, level, seed);
  for (let i = 0; i < 60; i++) {
    const input = brain.step();
    // P2 面朝左：后退方向是右
    if ((input.held & Btn.Right) !== 0) return i;
    a.step(0, input.held);
  }
  return 999;
}

describe('难度档位', () => {
  it('三档参数单调变强', () => {
    expect(CPU_LEVELS).toEqual(['easy', 'normal', 'hard']);
    expect(CPU_PROFILES.hard.reaction).toBeLessThan(CPU_PROFILES.easy.reaction);
    expect(CPU_PROFILES.hard.aggression).toBeGreaterThan(CPU_PROFILES.easy.aggression);
    expect(CPU_PROFILES.hard.guardChance).toBeGreaterThan(CPU_PROFILES.easy.guardChance);
    expect(CPU_PROFILES.hard.specialChance).toBeGreaterThan(CPU_PROFILES.easy.specialChance);
  });

  it('困难档反应明显更快（同一串种子平均帧数更短）', () => {
    const seeds = [1, 7, 42, 99, 555];
    const avg = (level: CpuLevel): number => {
      const list = seeds.map((s) => framesUntilGuard(level, s)).filter((n) => n < 999);
      return list.length === 0 ? 999 : list.reduce((a, b) => a + b, 0) / list.length;
    };
    expect(avg('hard')).toBeLessThan(avg('easy'));
  });

  it('简单档在反应时间内不会防御', () => {
    const frames = framesUntilGuard('easy', 3);
    expect(frames).toBeGreaterThanOrEqual(CPU_PROFILES.easy.reaction);
  });
});

describe('CPU 行为', () => {
  it('会主动靠近并打到人', () => {
    const a = arena();
    const brain = new CpuBrain(a.p2, a.p1, 'hard', 123);
    const dist0 = Math.abs(a.p2.x - a.p1.x);
    for (let i = 0; i < 400 && a.p1.hp === a.p1.maxHp; i++) a.step(0, brain.step().held);
    expect(Math.abs(a.p2.x - a.p1.x)).toBeLessThan(dist0);
    expect(a.p1.hp).toBeLessThan(a.p1.maxHp);
  });

  it('困难档会摇必杀技（走的是和玩家一样的指令通道）', () => {
    const a = arena();
    const brain = new CpuBrain(a.p2, a.p1, 'hard', 2024);
    const seen = new Set<string>();
    for (let i = 0; i < 900; i++) {
      a.step(0, brain.step().held);
      if (a.p2.move) seen.add(a.p2.move.id);
    }
    const specials = [...seen].filter((id) => /^(236|623|214|421)/.test(id));
    expect(specials.length).toBeGreaterThan(0);
  });

  it('不会对着空气一直挥拳（会走到够得着的距离）', () => {
    const a = arena(200);
    const brain = new CpuBrain(a.p2, a.p1, 'hard', 77);
    let hits = 0;
    for (let i = 0; i < 600; i++) {
      const before = a.p1.hp;
      a.step(0, brain.step().held);
      if (a.p1.hp < before) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('对手倒下或死亡时不再输出', () => {
    const a = arena();
    a.p2.hp = 0;
    a.p2.setState('dead');
    const brain = new CpuBrain(a.p2, a.p1, 'hard', 5);
    expect(brain.step().held).toBe(0);
  });

  it('同种子同结果（确定性）', () => {
    const run = (): string => {
      const a = arena();
      const brain = new CpuBrain(a.p2, a.p1, 'normal', 424242);
      const out: number[] = [];
      for (let i = 0; i < 300; i++) {
        const held = brain.step().held;
        out.push(held);
        a.step(0, held);
      }
      return out.join(',');
    };
    expect(run()).toBe(run());
  });
});

describe('CPU 会用自己的资源', () => {
  const mk = (meter: number, dist: number) => {
    const me = new Fighter(KYO, { x: 100, facing: 1 });
    const foe = new Fighter(IORI, { x: 100 + dist, facing: -1 });
    me.meter = meter;
    return { me, foe };
  };

  it('气满了会放超必杀（原来攒满气也只会普通必杀，等于浪费资源）', () => {
    let supers = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { me, foe } = mk(100, 40);
      const brain = new CpuBrain(me, foe, 'hard', seed);
      const seen: number[] = [];
      for (let i = 0; i < 240; i++) seen.push(brain.step().held);
      // 236236 的最后一下是 A+C 同按，用这个特征判断放了大招
      if (seen.some((h) => (h & Btn.A) !== 0 && (h & Btn.C) !== 0)) supers++;
    }
    expect(supers).toBeGreaterThan(0);
  });

  it('没气的时候绝不会放超必杀（不然就是作弊）', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { me, foe } = mk(0, 40);
      const brain = new CpuBrain(me, foe, 'hard', seed);
      for (let i = 0; i < 240; i++) {
        const h = brain.step().held;
        expect((h & Btn.A) !== 0 && (h & Btn.C) !== 0).toBe(false);
      }
    }
  });

  it('远距离不会搓升龙（升龙是贴脸对空用的）', () => {
    let dpFrames = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { me, foe } = mk(0, 150);
      const brain = new CpuBrain(me, foe, 'hard', seed);
      const seq: number[] = [];
      for (let i = 0; i < 120; i++) seq.push(brain.step().held);
      // 升龙的形状：先按前，再按下，再按下+前+按键
      for (let i = 0; i < seq.length - 2; i++) {
        if (seq[i] === Btn.Right && seq[i + 1] === Btn.Down && (seq[i + 2]! & Btn.Down) !== 0) dpFrames++;
      }
    }
    expect(dpFrames).toBeLessThan(20);
  });
});
