import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar } from '../src/data/schema';
import { IORI } from '../src/data/chars/iori';
import { ROSTER, charById } from '../src/data/chars';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { CommandParser } from '../src/input/parser';
import { Fighter } from '../src/sim/fighter';
import { World } from '../src/sim/world';

const D = Btn.Down;
const L = Btn.Left;
const R = Btn.Right;

const MOTION_FRAMES: Record<string, number[]> = {
  '236': [D, D | R, R],
  '214': [D, D | L, L],
  '623': [R, D, D | R],
  '63214': [R, D | R, D, D | L, L],
  '2363214': [D, D | R, R, D | R, D, D | L, L],
  '236236': [D, D | R, R, D, D | R, R],
  '6': [R],
};

function parserFor(motion: string, buttons: readonly ('A' | 'B' | 'C' | 'D')[]): CommandParser {
  const frames = MOTION_FRAMES[motion]!;
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

function arena(gap = 40): { world: World; p1: Fighter; p2: Fighter; step(held: number): void } {
  const world = new World(3);
  const p1 = world.add(new Fighter(IORI, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(IORI, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const step = (held: number): void => {
    world.step([{ held }, { held: 0 }]);
  };
  step(0);
  return { world, p1, p2, step };
}

describe('八神庵：数据自洽', () => {
  it('整表通过校验，姿势齐全', () => {
    expect(validateChar(IORI)).toEqual([]);
    expect(validateCharPoses(IORI)).toEqual([]);
    for (const move of Object.values(IORI.moves)) expect(hasPose(move.anim), move.id).toBe(true);
  });

  it('花名册能按 id 取到，两名角色 id 不重复', () => {
    expect(ROSTER.map((c) => c.id)).toEqual(['kyo', 'iori']);
    expect(charById('iori')?.name).toBe('八神庵');
    expect(charById('nobody')).toBeUndefined();
  });

  it('指令都能按出来', () => {
    for (const [key, move] of Object.entries(IORI.moves)) {
      if (!move.input) continue;
      const parser = parserFor(move.input.motion, move.input.buttons ?? []);
      expect(parser.match(move.input), `${key} ${move.input.motion}`).toBe(true);
    }
  });
});

describe('八神庵：招式特性', () => {
  it('葵花三段链闭合，最后一段击倒', () => {
    expect(IORI.moves['214A']!.cancel?.onHit).toEqual(['214A_2']);
    expect(IORI.moves['214A_2']!.cancel?.onHit).toEqual(['214A_3']);
    expect(IORI.moves['214A_3']!.hits[0]!.knockdown).toBe('slam');
  });

  it('屑風是不可防的指令投', () => {
    expect(IORI.moves['63214A']!.kind).toBe('throw');
    expect(IORI.moves['63214A']!.hits[0]!.guard).toBe('unblockable');
    expect(IORI.moves['63214A']!.blockable).toBe(false);
  });

  it('百合折り是中段（空中压制）', () => {
    expect(IORI.moves['jB']!.hits[0]!.guard).toBe('overhead');
    expect(IORI.moves['jB']!.airborne).toBe(true);
  });

  it('八稚女吃 100 气、八酒杯吃 50 气，都是多段', () => {
    expect(IORI.moves['2363214A']!.kind).toBe('super');
    expect(IORI.moves['2363214A']!.meterCost).toBe(100);
    expect(IORI.moves['2363214A']!.hits.length).toBe(5);
    expect(IORI.moves['236236A']!.meterCost).toBe(50);
    expect(IORI.moves['236236A']!.hits.length).toBe(2);
  });
});

describe('八神庵：上手能出招', () => {
  it('贴身 63214+A 是屑風（不会被葵花吃掉）', () => {
    const a = arena(40);
    for (const held of [R, D | R, D, D | L, L | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('63214A');
  });

  it('离得远同一个指令退化成葵花', () => {
    const a = arena(200);
    for (const held of [R, D | R, D, D | L, L | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('214A');
  });

  it('气满时 2363214+A 出八稚女', () => {
    const a = arena();
    a.p1.meter = 100;
    for (const held of [D, D | R, R, D | R, D, D | L, L | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('2363214A');
    expect(a.p1.meter).toBe(0);
  });
});
