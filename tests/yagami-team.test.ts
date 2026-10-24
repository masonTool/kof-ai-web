import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { BILLY } from '../src/data/chars/billy';
import { EIJI } from '../src/data/chars/eiji';
import { SHINGO } from '../src/data/chars/shingo';
import { KYO } from '../src/data/chars/kyo';
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
  const world = new World(43);
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

const YAGAMI_TEAM: readonly CharDef[] = [BILLY, EIJI, SHINGO];

describe.each(YAGAMI_TEAM)('$name：数据自洽', (char) => {
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
  it('八神队三人都在册，id 不重复', () => {
    expect(ROSTER.map((c) => c.id)).toEqual(expect.arrayContaining(['billy', 'eiji', 'shingo']));
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(ROSTER.length);
    expect(ROSTER.length).toBeGreaterThanOrEqual(22);
  });
});

describe('比利', () => {
  it('三节棍判定比京长（reach 加成）', () => {
    expect(BILLY.moves['5C']!.hits[0]!.box.w).toBeGreaterThan(KYO.moves['5C']!.hits[0]!.box.w);
  });

  it('旋風棍三段、末段击倒', () => {
    const move = BILLY.moves['236A']!;
    expect(move.hits).toHaveLength(3);
    expect(move.hits.at(-1)!.knockdown).toBe('slam');
  });

  it('火龍棍是飞行道具', () => {
    const a = arena(BILLY, 200);
    for (const held of [D, D | L, L | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('214A');
    for (let i = 0; i < 18 && a.world.entities.filter((e) => e instanceof Projectile).length === 0; i++) a.step(0);
    expect(a.world.entities.filter((e) => e instanceof Projectile).length).toBe(1);
  });

  it('三節棍中段打ち 有无敌帧且判定很高', () => {
    expect(BILLY.moves['623A']!.invuln?.[0]?.kind).toBe('full');
    expect(BILLY.moves['623A']!.hits[0]!.box.h).toBeGreaterThan(60);
  });

  it('超必杀两套：50 气四段、100 气五段', () => {
    expect(BILLY.moves['236236A']!.hits).toHaveLength(4);
    expect(BILLY.moves['236236AC']!.hits).toHaveLength(5);
  });
});

describe('如月影二', () => {
  it('霞斬り带位移、影すべり下段带位移', () => {
    expect(EIJI.moves['236A']!.travel).toBeGreaterThan(50);
    expect(EIJI.moves['214A']!.hits[0]!.guard).toBe('low');
    expect(EIJI.moves['214A']!.travel).toBeGreaterThan(50);
  });

  it('空蝉是纯位移无敌技', () => {
    const move = EIJI.moves['63214B']!;
    expect(move.hits).toHaveLength(0);
    expect(move.travel).toBeGreaterThan(80);
    expect(move.invuln?.[0]?.kind).toBe('full');
  });

  it('骨破ぎ两段、斩鉄蟷螂四段', () => {
    expect(EIJI.moves['623A']!.hits).toHaveLength(2);
    expect(EIJI.moves['236236A']!.hits).toHaveLength(4);
  });

  it('出手快但伤害低', () => {
    expect(EIJI.walk.fwd).toBeGreaterThan(BILLY.walk.fwd);
    expect(EIJI.moves['5C']!.hits[0]!.damage).toBeLessThan(BILLY.moves['5C']!.hits[0]!.damage);
  });
});

describe('矢吹真吾', () => {
  it('机制照抄京：荒咬能接二段', () => {
    expect(SHINGO.moves['236A']!.cancel?.onHit).toEqual(['236A_2']);
    expect(SHINGO.moves['236A_2']!.hits[0]!.knockdown).toBe('slam');
  });

  it('但各项数值都比京弱（徒弟版）', () => {
    expect(SHINGO.moves['236A']!.hits[0]!.damage).toBeLessThan(KYO.moves['236A']!.hits[0]!.damage);
    expect(SHINGO.moves['236A']!.hits[0]!.box.w).toBeLessThan(KYO.moves['236A']!.hits[0]!.box.w);
    expect(SHINGO.moves['623A']!.invuln![0]!.frames[1]).toBeLessThan(KYO.moves['623P']!.invuln![0]!.frames[1]);
  });

  it('真吾キック 带位移', () => {
    expect(SHINGO.moves['214B']!.travel).toBeGreaterThan(30);
  });

  it('两套超必杀：50 气三段、100 气四段', () => {
    expect(SHINGO.moves['236236A']!.hits).toHaveLength(3);
    expect(SHINGO.moves['236236AC']!.hits).toHaveLength(4);
  });
});
