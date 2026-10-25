import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { BENIMARU, DAIMON, ROSTER, charById } from '../src/data/chars';
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
  '6': [R],
  '4': [L],
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

function arena(char: CharDef, gap = 40): { world: World; p1: Fighter; p2: Fighter; step(held: number): void } {
  const world = new World(13);
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

describe('花名册', () => {
  it('花名册 id 唯一，按 id 能取到', () => {
    expect(ROSTER.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(ROSTER.length);
    expect(charById('benimaru')?.name).toBe('二阶堂红丸');
    expect(charById('daimon')?.name).toBe('大门五郎');
  });
});

describe.each([BENIMARU, DAIMON])('$name：数据自洽', (char) => {
  it('整表通过校验，姿势齐全', () => {
    expect(validateChar(char)).toEqual([]);
    expect(validateCharPoses(char)).toEqual([]);
    for (const move of Object.values(char.moves)) expect(hasPose(move.anim), move.id).toBe(true);
  });

  it('每个带指令的招式都能被解析出来', () => {
    for (const [key, move] of Object.entries(char.moves)) {
      if (!move.input) continue;
      const parser = parserFor(move.input.motion, move.input.buttons ?? []);
      expect(parser.match(move.input), `${key} ${move.input.motion}`).toBe(true);
    }
  });

  it('招式 total 都不小于判定结束帧', () => {
    for (const move of Object.values(char.moves)) {
      for (const h of move.hits) expect(h.frames[1], `${move.id}/${h.id}`).toBeLessThan(move.total);
    }
  });
});

describe('二阶堂红丸', () => {
  it('雷靭拳是真的飞行道具（不再用近身斩替代）', () => {
    expect(BENIMARU.moves['236A']!.projectile).toBeDefined();
    expect(BENIMARU.moves['236A']!.hits).toHaveLength(0);
  });

  it('放出雷靭拳后世界里会多一个道具', () => {
    const a = arena(BENIMARU, 160);
    for (const held of [D, D | R, R | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('236A');
    for (let i = 0; i < 14 && a.world.entities.filter((e) => e instanceof Projectile).length === 0; i++) a.step(0);
    expect(a.world.entities.filter((e) => e instanceof Projectile).length).toBe(1);
  });

  it('居合蹴能取消接反動三段蹴り', () => {
    expect(BENIMARU.moves['214B']!.cancel?.onHit).toEqual(['236B']);
    expect(BENIMARU.moves['236B']!.hits).toHaveLength(3);
  });

  it('走路比别人快（速度型定位）', () => {
    expect(BENIMARU.walk.fwd).toBeGreaterThan(DAIMON.walk.fwd);
  });
});

describe('大门五郎', () => {
  it('超大外刈是不可防的投技', () => {
    const move = DAIMON.moves['63214B']!;
    expect(move.kind).toBe('throw');
    expect(move.hits[0]!.guard).toBe('unblockable');
    expect(move.blockable).toBe(false);
  });

  it('地雷震是下段、击倒、范围大', () => {
    const hitDef = DAIMON.moves['214A']!.hits[0]!;
    expect(hitDef.guard).toBe('low');
    expect(hitDef.knockdown).toBe('trip');
    expect(hitDef.box.w).toBeGreaterThan(60);
  });

  it('地獄極楽落とし吃 100 气且不可防', () => {
    const move = DAIMON.moves['236236A']!;
    expect(move.meterCost).toBe(100);
    expect(move.hits.every((h) => h.guard === 'unblockable')).toBe(true);
  });

  it('血比别人厚、走得比别人慢（重量级定位）', () => {
    expect(DAIMON.hp).toBeGreaterThan(BENIMARU.hp);
    expect(DAIMON.walk.fwd).toBeLessThan(BENIMARU.walk.fwd);
  });

  it('贴身时 63214+B 出得来', () => {
    const a = arena(DAIMON, 40);
    for (const held of [R, D | R, D, D | L, L | Btn.B]) a.step(held);
    expect(a.p1.move?.id).toBe('63214B');
  });
});

describe('投技覆盖', () => {
  const THROWERS = ['kyo', 'iori', 'terry', 'ryo', 'robert', 'leona', 'ralf', 'clark', 'athena'];

  it('主力角色都有投技（←+C），且类型是 throw', () => {
    for (const id of THROWERS) {
      const c = ROSTER.find((x) => x.id === id);
      expect(c, id).toBeTruthy();
      const mv = (c!.moves as Record<string, { kind?: string; input?: { motion?: string } } | undefined>)['4C'];
      expect(mv, `${id} 没有 4C`).toBeTruthy();
      expect(mv!.kind, `${id} 的 4C 不是 throw`).toBe('throw');
      expect(mv!.input?.motion, `${id} 的 4C 指令`).toBe('4');
    }
  });

  it('投技都不消耗气（是基础手段，不是必杀）', () => {
    for (const id of THROWERS) {
      const c = ROSTER.find((x) => x.id === id)!;
      const mv = (c.moves as Record<string, { meterCost?: number } | undefined>)['4C'];
      expect(mv?.meterCost ?? 0, id).toBe(0);
    }
  });
});
