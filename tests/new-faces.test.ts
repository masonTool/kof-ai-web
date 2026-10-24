import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { YASHIRO } from '../src/data/chars/yashiro';
import { SHERMIE } from '../src/data/chars/shermie';
import { CHRIS } from '../src/data/chars/chris';
import { OROCHI_IORI } from '../src/data/chars/orochi-iori';
import { OROCHI_LEONA } from '../src/data/chars/orochi-leona';
import { IORI } from '../src/data/chars/iori';
import { LEONA } from '../src/data/chars/leona';
import { ROSTER } from '../src/data/chars';
import { variantOf } from '../src/data/chars/variant';
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
  '214214': [D, D | L, L, D, D | L, L],
  '2363214': [D, D | R, R, D | R, D, D | L, L],
  '6': [R],
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

function arena(char: CharDef, gap = 40): { world: World; p1: Fighter; step(held: number): void } {
  const world = new World(47);
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
  return { world, p1, step };
}

const NEW_FACES: readonly CharDef[] = [YASHIRO, SHERMIE, CHRIS];
const BOSSES: readonly CharDef[] = [OROCHI_IORI, OROCHI_LEONA];

describe.each([...NEW_FACES, ...BOSSES])('$name：数据自洽', (char) => {
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
});

describe('花名册', () => {
  it('新面孔队与暴走版都在册，id 不重复', () => {
    expect(ROSTER.map((c) => c.id)).toEqual(
      expect.arrayContaining(['yashiro', 'shermie', 'chris', 'orochi_iori', 'orochi_leona']),
    );
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(ROSTER.length);
    expect(ROSTER.length).toBeGreaterThanOrEqual(27);
  });
});

describe('角色派生工具', () => {
  it('派生角色的 id/名字/配色与本体不同', () => {
    expect(OROCHI_IORI.id).not.toBe(IORI.id);
    expect(OROCHI_IORI.name).not.toBe(IORI.name);
    expect(OROCHI_IORI.palette).not.toEqual(IORI.palette);
  });

  it('招式表是深拷贝（改派生版不影响本体）', () => {
    const base = variantOf(IORI, { id: 'x', name: 'x', palette: IORI.palette });
    const before = IORI.moves['5C']!.hits[0]!.damage;
    base.moves['5C']!.hits[0]!.damage = 9999;
    expect(IORI.moves['5C']!.hits[0]!.damage).toBe(before);
  });

  it('伤害倍率真的生效', () => {
    const strong = variantOf(IORI, { id: 'y', name: 'y', palette: IORI.palette, damage: 1.5 });
    expect(strong.moves['5C']!.hits[0]!.damage).toBe(Math.round(IORI.moves['5C']!.hits[0]!.damage * 1.5));
  });

  it('速度倍率会缩短总帧数', () => {
    const fast = variantOf(IORI, { id: 'z', name: 'z', palette: IORI.palette, speed: 0.8 });
    expect(fast.moves['5C']!.total).toBeLessThan(IORI.moves['5C']!.total);
  });
});

describe('暴走版', () => {
  it('暴走庵 伤害比庵高、血更少', () => {
    expect(OROCHI_IORI.moves['5C']!.hits[0]!.damage).toBeGreaterThan(IORI.moves['5C']!.hits[0]!.damage);
    expect(OROCHI_IORI.hp).toBeLessThan(IORI.hp);
  });

  it('暴走莉安娜 伤害比莉安娜高、血更少', () => {
    expect(OROCHI_LEONA.moves['236A']!.hits[0]!.damage).toBeGreaterThan(LEONA.moves['236A']!.hits[0]!.damage);
    expect(OROCHI_LEONA.hp).toBeLessThan(LEONA.hp);
  });

  it('招式结构与本体一致（同一个 id 的招式都在）', () => {
    for (const key of Object.keys(IORI.moves)) expect(OROCHI_IORI.moves[key], key).toBeDefined();
    for (const key of Object.keys(LEONA.moves)) expect(OROCHI_LEONA.moves[key], key).toBeDefined();
  });
});

describe('新面孔队', () => {
  it('七枷社：突进肩撞、中段砸、对空，超必杀两套', () => {
    expect(YASHIRO.moves['236A']!.travel).toBeGreaterThan(40);
    expect(YASHIRO.moves['214A']!.hits[0]!.guard).toBe('overhead');
    expect(YASHIRO.moves['623A']!.invuln?.[0]?.kind).toBe('full');
    expect(YASHIRO.moves['236236A']!.meterCost).toBe(50);
    expect(YASHIRO.moves['236236AC']!.meterCost).toBe(100);
  });

  it('夏尔米：摔投不可防 + 雷电突进', () => {
    expect(SHERMIE.moves['63214B']!.kind).toBe('throw');
    expect(SHERMIE.moves['63214B']!.hits[0]!.guard).toBe('unblockable');
    expect(SHERMIE.moves['236236A']!.hits.every((h) => h.guard === 'unblockable')).toBe(true);
  });

  it('克里斯的火焰是飞行道具', () => {
    const a = arena(CHRIS, 200);
    for (const held of [D, D | R, R | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('236A');
    for (let i = 0; i < 16 && a.world.entities.filter((e) => e instanceof Projectile).length === 0; i++) a.step(0);
    expect(a.world.entities.filter((e) => e instanceof Projectile).length).toBe(1);
  });

  it('克里斯 又有滑铲下段又有无敌对空', () => {
    expect(CHRIS.moves['214B']!.hits[0]!.guard).toBe('low');
    expect(CHRIS.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('夏尔米比七枷社脆一点、七枷社血最厚', () => {
    expect(YASHIRO.hp).toBeGreaterThan(CHRIS.hp);
    expect(SHERMIE.hp).toBeLessThan(YASHIRO.hp);
  });
});
