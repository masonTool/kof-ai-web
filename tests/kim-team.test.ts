import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { KIM } from '../src/data/chars/kim';
import { CHANG } from '../src/data/chars/chang';
import { CHOI } from '../src/data/chars/choi';
import { ROSTER } from '../src/data/chars';
import { CommandParser } from '../src/input/parser';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { Fighter } from '../src/sim/fighter';
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
  const world = new World(41);
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

const KIM_TEAM: readonly CharDef[] = [KIM, CHANG, CHOI];

describe.each(KIM_TEAM)('$name：数据自洽', (char) => {
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
  it('金队三人都在册，id 不重复', () => {
    expect(ROSTER.map((c) => c.id)).toEqual(expect.arrayContaining(['kim', 'chang', 'choi']));
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(ROSTER.length);
    expect(ROSTER.length).toBeGreaterThanOrEqual(19);
  });
});

describe('金家藩', () => {
  it('半月斬带位移、飛燕斬中段', () => {
    expect(KIM.moves['236B']!.travel).toBeGreaterThan(50);
    expect(KIM.moves['214B']!.hits[0]!.guard).toBe('overhead');
  });

  it('空連脚三段且有无敌帧', () => {
    expect(KIM.moves['623B']!.hits).toHaveLength(3);
    expect(KIM.moves['623B']!.invuln?.[0]?.kind).toBe('full');
  });

  it('鳳凰脚两套：50 气五段、100 气六段', () => {
    expect(KIM.moves['236236B']!.hits).toHaveLength(5);
    expect(KIM.moves['236236B']!.meterCost).toBe(50);
    expect(KIM.moves['236236AC']!.hits).toHaveLength(6);
    expect(KIM.moves['236236AC']!.meterCost).toBe(100);
  });

  it('贴脸能踢到人', () => {
    const a = arena(KIM, 40);
    for (const held of [D, D | R, R | Btn.B]) a.step(held);
    for (let i = 0; i < 30 && a.p2.hp === a.p2.maxHp; i++) a.step(0);
    expect(a.p2.hp).toBeLessThan(a.p2.maxHp);
  });
});

describe('陈国汉', () => {
  it('鉄球大回転四段、末段击倒', () => {
    const move = CHANG.moves['236A']!;
    expect(move.hits).toHaveLength(4);
    expect(move.hits.at(-1)!.knockdown).toBe('slam');
  });

  it('大破壊投げ 不可防', () => {
    const move = CHANG.moves['63214A']!;
    expect(move.kind).toBe('throw');
    expect(move.hits[0]!.guard).toBe('unblockable');
  });

  it('鉄球大圧殺 中段', () => {
    expect(CHANG.moves['214A']!.hits[0]!.guard).toBe('overhead');
  });

  it('最厚最慢最大只', () => {
    expect(CHANG.hp).toBeGreaterThan(KIM.hp);
    expect(CHANG.walk.fwd).toBeLessThan(KIM.walk.fwd);
    expect(CHANG.boxes.stand.w).toBeGreaterThan(KIM.boxes.stand.w);
    expect(CHANG.push?.w).toBeGreaterThan(KIM.push!.w);
  });

  it('鉄球大暴走 100 气五段', () => {
    expect(CHANG.moves['236236AC']!.meterCost).toBe(100);
    expect(CHANG.moves['236236AC']!.hits).toHaveLength(5);
  });
});

describe('蔡宝奇', () => {
  it('旋風斬四段且带位移', () => {
    expect(CHOI.moves['236A']!.hits).toHaveLength(4);
    expect(CHOI.moves['236A']!.travel).toBeGreaterThan(60);
  });

  it('疾風斬下段、飛翔空裂斬无敌', () => {
    expect(CHOI.moves['214A']!.hits[0]!.guard).toBe('low');
    expect(CHOI.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('最矮最快最脆', () => {
    expect(CHOI.hp).toBeLessThan(CHANG.hp);
    expect(CHOI.walk.fwd).toBeGreaterThan(CHANG.walk.fwd);
    expect(CHOI.boxes.stand.h).toBeLessThan(CHANG.boxes.stand.h);
    expect(CHOI.boxes.stand.h).toBeLessThan(60);
  });

  it('真！超絶竜巻斬 两套段数正确', () => {
    expect(CHOI.moves['236236A']!.hits).toHaveLength(5);
    expect(CHOI.moves['236236AC']!.hits).toHaveLength(6);
  });
});
