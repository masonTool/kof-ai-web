import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { TERRY } from '../src/data/chars/terry';
import { ANDY } from '../src/data/chars/andy';
import { JOE } from '../src/data/chars/joe';
import { CommandParser } from '../src/input/parser';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { Fighter } from '../src/sim/fighter';
import { Projectile } from '../src/sim/projectile';
import { resolveCombat, resolveProjectiles } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { World } from '../src/sim/world';
import { buildNormals, standardBoxes } from '../src/data/chars/template';

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
  '4': [L],
  '3': [D | R],
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
  const world = new World(17);
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

const FATAL_FURY: readonly CharDef[] = [TERRY, ANDY, JOE];

describe('招式模板', () => {
  it('生成的通常技表能通过校验', () => {
    const moves = buildNormals({ cancels: ['236A'] });
    expect(Object.keys(moves).sort()).toEqual(
      ['2A', '2B', '2C', '2D', '5A', '5B', '5C', '5D', 'AB', 'CD', 'jA', 'jB', 'jC', 'jD'].sort(),
    );
    for (const move of Object.values(moves)) {
      expect(move.hits.length > 0 || move.kind === 'system', move.id).toBe(true);
      for (const h of move.hits) expect(h.frames[1]).toBeLessThan(move.total);
    }
  });

  it('力量/速度/距离三个旋钮真的起作用', () => {
    const base = buildNormals();
    const strong = buildNormals({ power: 1.5 });
    const fast = buildNormals({ speed: 0.6 });
    const reach = buildNormals({ reach: 1.5 });

    expect(strong['5C']!.hits[0]!.damage).toBeGreaterThan(base['5C']!.hits[0]!.damage);
    expect(fast['5C']!.total).toBeLessThan(base['5C']!.total);
    expect(reach['5C']!.hits[0]!.box.w).toBeGreaterThan(base['5C']!.hits[0]!.box.w);
  });

  it('取消表能注入到通常技里', () => {
    const moves = buildNormals({ cancels: ['236X'] });
    expect(moves['5C']!.cancel?.onHit).toContain('236X');
    expect(moves['2C']!.cancel?.onHit).toContain('236X');
  });

  it('标准受击盒是三套且高度合理', () => {
    const boxes = standardBoxes();
    expect(boxes.stand.h).toBeGreaterThan(boxes.crouch.h);
    expect(boxes.air.h).toBeGreaterThan(60);
  });
});

describe.each(FATAL_FURY)('$name：数据自洽', (char) => {
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

describe('特瑞', () => {
  it('パワーウェイブ是飞行道具', () => {
    expect(TERRY.moves['236A']!.projectile).toBeDefined();
    const a = arena(TERRY, 200);
    for (const held of [D, D | R, R | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('236A');
    for (let i = 0; i < 14 && a.world.entities.filter((e) => e instanceof Projectile).length === 0; i++) a.step(0);
    expect(a.world.entities.filter((e) => e instanceof Projectile).length).toBe(1);
  });

  it('バーンナックル带位移、ライジングタックル有无敌帧', () => {
    expect(TERRY.moves['214A']!.travel).toBeGreaterThan(30);
    expect(TERRY.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('两个超必杀：パワーゲイザー 50 气、バスターウルフ 100 气', () => {
    expect(TERRY.moves['236236A']!.meterCost).toBe(50);
    expect(TERRY.moves['236236B']!.meterCost).toBe(100);
  });
});

describe('安迪', () => {
  it('飛翔拳是飞行道具', () => {
    expect(ANDY.moves['236A']!.projectile).toBeDefined();
  });

  it('斬影拳带位移、三段', () => {
    expect(ANDY.moves['41236A']!.travel).toBeGreaterThan(50);
    expect(ANDY.moves['41236A']!.hits).toHaveLength(3);
  });

  it('昇龍弾有无敌帧（对空）', () => {
    expect(ANDY.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('超裂破弾吃 100 气、五段', () => {
    expect(ANDY.moves['2363214A']!.meterCost).toBe(100);
    expect(ANDY.moves['2363214A']!.hits).toHaveLength(5);
  });
});

describe('东丈', () => {
  it('爆裂拳是多段连打，最后一段击倒', () => {
    const move = JOE.moves['236A']!;
    expect(move.hits.length).toBeGreaterThanOrEqual(4);
    expect(move.hits.at(-1)!.knockdown).toBe('slam');
  });

  it('竜巻旋風脚多段且带位移', () => {
    expect(JOE.moves['63214B']!.hits.length).toBeGreaterThanOrEqual(4);
    expect(JOE.moves['63214B']!.travel).toBeGreaterThan(40);
  });

  it('黄金のカカト落とし是中段', () => {
    expect(JOE.moves['214B']!.hits[0]!.guard).toBe('overhead');
  });

  it('两个超必杀都要气', () => {
    expect(JOE.moves['236236B']!.meterCost).toBe(50);
    expect(JOE.moves['214214B']!.meterCost).toBe(100);
  });

  it('贴身 63214+B 出得来', () => {
    const a = arena(JOE, 40);
    for (const held of [R, D | R, D, D | L, L | Btn.B]) a.step(held);
    expect(a.p1.move?.id).toBe('63214B');
  });
});
