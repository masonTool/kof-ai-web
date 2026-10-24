import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { ATHENA } from '../src/data/chars/athena';
import { KENSOU } from '../src/data/chars/kensou';
import { CHIN } from '../src/data/chars/chin';
import { ROSTER } from '../src/data/chars';
import { CommandParser } from '../src/input/parser';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { Fighter } from '../src/sim/fighter';
import { Projectile } from '../src/sim/projectile';
import { resolveCombat, resolveProjectiles } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { World } from '../src/sim/world';

const D = Btn.Down;
const L = Btn.Left;
const R = Btn.Right;

const MOTION_FRAMES: Record<string, number[]> = {
  '236': [D, D | R, R],
  '214': [D, D | L, L],
  '623': [R, D, D | R],
  '63214': [R, D | R, D, D | L, L],
  '236236': [D, D | R, R, D, D | R, R],
};

function parserFor(motion: string, buttons: readonly ('A' | 'B' | 'C' | 'D')[]): CommandParser {
  const frames = MOTION_FRAMES[motion];
  if (!frames) throw new Error(`没有为指令 ${motion} 准备方向序列`);
  const parser = new CommandParser(1);
  let mask = 0;
  for (const b of buttons) mask |= { A: Btn.A, B: Btn.B, C: Btn.C, D: Btn.D }[b];
  const seq = [...frames];
  seq[seq.length - 1] = seq[seq.length - 1]! | mask;
  let prev = 0;
  for (const held of seq) {
    parser.push(edges(held, prev));
    prev = held;
  }
  return parser;
}

function arena(char: CharDef, gap = 40): { world: World; p1: Fighter; p2: Fighter; step(held: number): void } {
  const world = new World(37);
  const p1 = world.add(new Fighter(char, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(char, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const fighters = [p1, p2];
  const step = (held: number): void => {
    world.step([{ held }, { held: 0 }]);
    resolveCombat(world, fighters);
    resolveProjectiles(world, fighters);
    resolvePushAll(fighters);
    world.sweep();
  };
  step(0);
  return { world, p1, p2, step };
}

/** 放一招并数出生成的道具数 */
function projectileCount(char: CharDef, moveId: string, seq: readonly number[]): number {
  const a = arena(char, 220);
  for (const held of seq) a.step(held);
  expect(a.p1.move?.id, moveId).toBe(moveId);
  for (let i = 0; i < 26 && a.world.entities.filter((e) => e instanceof Projectile).length === 0; i++) a.step(0);
  return a.world.entities.filter((e) => e instanceof Projectile).length;
}

const PSYCHO: readonly CharDef[] = [ATHENA, KENSOU, CHIN];

describe.each(PSYCHO)('$name：数据自洽', (char) => {
  it('整表通过校验，姿势齐全', () => {
    expect(validateChar(char)).toEqual([]);
    expect(validateCharPoses(char)).toEqual([]);
    for (const move of Object.values(char.moves)) expect(hasPose(move.anim), move.id).toBe(true);
  });

  it('每个带指令的招式都能按出来', () => {
    for (const [key, move] of Object.entries(char.moves)) {
      if (!move.input) continue;
      const parser = parserFor(move.input.motion, move.input.buttons ?? []);
      expect(parser.match(move.input), `${key} ${move.input.motion}`).toBe(true);
    }
  });

  it('招式 total 不小于判定结束帧', () => {
    for (const move of Object.values(char.moves)) {
      for (const h of move.hits) expect(h.frames[1], `${move.id}/${h.id}`).toBeLessThan(move.total);
    }
  });
});

describe('花名册', () => {
  it('超能力队三人都在册，id 不重复', () => {
    expect(ROSTER.map((c) => c.id)).toEqual(expect.arrayContaining(['athena', 'kensou', 'chin']));
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(ROSTER.length);
    expect(ROSTER.length).toBeGreaterThanOrEqual(16);
  });
});

describe('麻宫雅典娜', () => {
  it('サイコボール 是飞行道具', () => {
    expect(projectileCount(ATHENA, '236A', [D, D | R, R | Btn.A])).toBe(1);
  });

  it('サイキックテレポート 位移大且全身无敌', () => {
    const move = ATHENA.moves['63214B']!;
    expect(move.travel).toBeGreaterThan(90);
    expect(move.invuln?.[0]?.kind).toBe('full');
  });

  it('フェニックスアロー 是中段', () => {
    expect(ATHENA.moves['214B']!.hits[0]!.guard).toBe('overhead');
  });

  it('两套超必杀：50 气五段、100 气六段', () => {
    expect(ATHENA.moves['236236A']!.meterCost).toBe(50);
    expect(ATHENA.moves['236236A']!.hits).toHaveLength(5);
    expect(ATHENA.moves['236236AC']!.meterCost).toBe(100);
    expect(ATHENA.moves['236236AC']!.hits).toHaveLength(6);
  });

  it('体型小、血薄', () => {
    expect(ATHENA.hp).toBeLessThan(1000);
    expect(ATHENA.boxes.stand.h).toBeLessThan(78);
  });
});

describe('椎拳崇', () => {
  it('超球弾 是飞行道具', () => {
    expect(projectileCount(KENSOU, '236A', [D, D | R, R | Btn.A])).toBe(1);
  });

  it('龍連牙 三段且带位移', () => {
    expect(KENSOU.moves['214A']!.hits).toHaveLength(3);
    expect(KENSOU.moves['214A']!.travel).toBeGreaterThan(30);
  });

  it('龍顎砕 有无敌帧', () => {
    expect(KENSOU.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('神龍撃 50 气是道具，神龍天舞脚 100 气四段', () => {
    expect(KENSOU.moves['236236A']!.projectile).toBeDefined();
    expect(KENSOU.moves['236236A']!.meterCost).toBe(50);
    expect(KENSOU.moves['236236AC']!.meterCost).toBe(100);
    expect(KENSOU.moves['236236AC']!.hits).toHaveLength(4);
  });
});

describe('镇元斋', () => {
  it('回転的空突拳 三段且带位移', () => {
    expect(CHIN.moves['236A']!.hits).toHaveLength(3);
    expect(CHIN.moves['236A']!.travel).toBeGreaterThan(40);
  });

  it('柳燐蓬萊 是下段', () => {
    expect(CHIN.moves['214B']!.hits[0]!.guard).toBe('low');
  });

  it('酔歩 无敌位移', () => {
    const move = CHIN.moves['623A']!;
    expect(move.invuln?.[0]?.kind).toBe('full');
    expect(move.travel).toBeGreaterThan(60);
  });

  it('个子最矮（受击盒最低）', () => {
    expect(CHIN.boxes.stand.h).toBeLessThan(ATHENA.boxes.stand.h);
  });

  it('两套超必杀都要气', () => {
    expect(CHIN.moves['236236A']!.meterCost).toBe(50);
    expect(CHIN.moves['236236AC']!.meterCost).toBe(100);
  });
});
