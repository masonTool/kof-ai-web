import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { RYO } from '../src/data/chars/ryo';
import { ROBERT } from '../src/data/chars/robert';
import { YURI } from '../src/data/chars/yuri';
import { CommandParser } from '../src/input/parser';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { Fighter } from '../src/sim/fighter';
import { Projectile } from '../src/sim/projectile';
import { resolveCombat, resolveProjectiles } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { World } from '../src/sim/world';
import { ROSTER } from '../src/data/chars';

const D = Btn.Down;
const L = Btn.Left;
const R = Btn.Right;

const MOTION_FRAMES: Record<string, number[]> = {
  '236': [D, D | R, R],
  '214': [D, D | L, L],
  '623': [R, D, D | R],
  '41236': [L, D | L, D, D | R, R],
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

function arena(char: CharDef, gap = 40): { world: World; p1: Fighter; p2: Fighter; step(held: number): void } {
  const world = new World(23);
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

/** 放一个招式并等道具出现 */
function fireProjectile(char: CharDef, moveId: string, motion: readonly number[]): number {
  const a = arena(char, 220);
  for (const held of motion) a.step(held);
  expect(a.p1.move?.id, moveId).toBe(moveId);
  for (let i = 0; i < 24 && a.world.entities.filter((e) => e instanceof Projectile).length === 0; i++) a.step(0);
  return a.world.entities.filter((e) => e instanceof Projectile).length;
}

const AOF: readonly CharDef[] = [RYO, ROBERT, YURI];

describe.each(AOF)('$name：数据自洽', (char) => {
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

describe('花名册已扩到龙虎队', () => {
  it('十人，id 唯一', () => {
    expect(ROSTER.length).toBe(10);
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(10);
    expect(ROSTER.map((c) => c.id)).toEqual(expect.arrayContaining(['ryo', 'robert', 'yuri']));
  });
});

describe('坂崎亮', () => {
  it('虎煌拳是飞行道具', () => {
    expect(fireProjectile(RYO, '236A', [D, D | R, R | Btn.A])).toBe(1);
  });

  it('暫烈拳三段、末段击倒', () => {
    const move = RYO.moves['236C']!;
    expect(move.hits).toHaveLength(3);
    expect(move.hits.at(-1)!.knockdown).toBe('slam');
  });

  it('飛燕疾風脚是中段且带位移，連舞拳有无敌帧', () => {
    expect(RYO.moves['214B']!.hits[0]!.guard).toBe('overhead');
    expect(RYO.moves['214B']!.travel).toBeGreaterThan(30);
    expect(RYO.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('覇王翔吼拳 50 气也是飞行道具，天地覇煌拳 100 气', () => {
    expect(RYO.moves['236236A']!.projectile).toBeDefined();
    expect(RYO.moves['236236A']!.meterCost).toBe(50);
    expect(RYO.moves['236236C']!.meterCost).toBe(100);
  });
});

describe('罗伯特', () => {
  it('龍撃拳是飞行道具', () => {
    expect(fireProjectile(ROBERT, '236A', [D, D | R, R | Btn.A])).toBe(1);
  });

  it('幻影脚・連 能取消接龍撃拳', () => {
    expect(ROBERT.moves['214A']!.cancel?.onHit).toEqual(['236A']);
  });

  it('龍虎乱舞五段、100 气，昇龍脚无敌', () => {
    expect(ROBERT.moves['236236B']!.hits).toHaveLength(5);
    expect(ROBERT.moves['236236B']!.meterCost).toBe(100);
    expect(ROBERT.moves['623B']!.invuln?.[0]?.kind).toBe('full');
  });
});

describe('坂崎百合', () => {
  it('虎煌拳是小气弹', () => {
    expect(fireProjectile(YURI, '236A', [D, D | R, R | Btn.A])).toBe(1);
  });

  it('空牙有无敌帧（对空）', () => {
    expect(YURI.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('百合脚是中段', () => {
    expect(YURI.moves['214B']!.hits[0]!.guard).toBe('overhead');
  });

  it('又小又快：血最少、走得最快', () => {
    expect(YURI.hp).toBeLessThan(RYO.hp);
    expect(YURI.walk.fwd).toBeGreaterThan(RYO.walk.fwd);
    expect(YURI.boxes.stand.h).toBeLessThan(RYO.boxes.stand.h);
  });

  it('覇王天翔翼 100 气四段', () => {
    expect(YURI.moves['236236C']!.meterCost).toBe(100);
    expect(YURI.moves['236236C']!.hits).toHaveLength(4);
  });
});
