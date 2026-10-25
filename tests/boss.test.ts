import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { GOENITZ } from '../src/data/chars/goenitz';
import { OROCHI } from '../src/data/chars/orochi';
import { KYO } from '../src/data/chars/kyo';
import { ROSTER } from '../src/data/chars';
import { CommandParser } from '../src/input/parser';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { Fighter } from '../src/sim/fighter';
import { METER_MAX, STAGE_LEFT, STAGE_RIGHT } from '../src/sim/constants';
import { resolveCombat, resolveProjectiles } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { FighterState } from '../src/sim/state';
import { World } from '../src/sim/world';

const D = Btn.Down;
const L = Btn.Left;
const R = Btn.Right;

const MOTION_FRAMES: Record<string, number[]> = {
  '236': [D, D | R, R],
  '214': [D, D | L, L],
  '623': [R, D, D | R],
  '236236': [D, D | R, R, D, D | R, R],
  '6': [R],
  '4': [L],
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

interface Arena {
  world: World;
  p1: Fighter;
  p2: Fighter;
  step(held1: number, held2?: number): void;
}

function arena(char1: CharDef, char2: CharDef, gap = 40): Arena {
  const world = new World(53);
  const p1 = world.add(new Fighter(char1, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(char2, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const fighters = [p1, p2];
  const step = (held1: number, held2 = 0): void => {
    world.step([{ held: held1 }, { held: held2 }]);
    resolveCombat(world, fighters);
    resolveProjectiles(world, fighters);
    resolvePushAll(fighters);
    world.sweep();
  };
  step(0);
  return { world, p1, p2, step };
}

const BOSSES: readonly CharDef[] = [GOENITZ, OROCHI];

describe.each(BOSSES)('$name：数据自洽', (char) => {
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
  it('两个 BOSS 都在册，id 不重复', () => {
    expect(ROSTER.map((c) => c.id)).toEqual(expect.arrayContaining(['goenitz', 'orochi']));
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(ROSTER.length);
    expect(ROSTER.length).toBeGreaterThanOrEqual(29);
  });
});

describe('BOSS 属性', () => {
  it('普通角色不吃减伤', () => {
    const a = arena(KYO, KYO);
    a.p2.takeDamage(100);
    expect(a.p2.hp).toBe(a.p2.maxHp - 100);
  });

  it('ゲーニッツ 按倍率减伤', () => {
    const a = arena(GOENITZ, GOENITZ);
    a.p2.takeDamage(100);
    expect(a.p2.hp).toBe(a.p2.maxHp - 80); // damageTaken 0.8
  });

  it('大蛇 也减伤，但血更厚', () => {
    const a = arena(OROCHI, OROCHI);
    a.p2.takeDamage(100);
    expect(a.p2.hp).toBe(a.p2.maxHp - 85);
    expect(a.p2.maxHp).toBe(1400);
  });

  it('BOSS 每帧自动回气，且不会超过上限', () => {
    const a = arena(GOENITZ, GOENITZ);
    a.p1.meter = 0;
    for (let i = 0; i < 10; i++) a.step(0);
    expect(a.p1.meter).toBeGreaterThan(0);

    a.p1.meter = METER_MAX - 0.5;
    for (let i = 0; i < 10; i++) a.step(0);
    expect(a.p1.meter).toBe(METER_MAX);
  });

  it('气槽不会超过上限（普通角色也一样）', () => {
    const a = arena(KYO, KYO);
    a.p1.meter = METER_MAX - 1;
    a.p1.addMeter(50);
    expect(a.p1.meter).toBe(METER_MAX);
  });

  it('普通角色不会自己回气', () => {
    const a = arena(KYO, KYO);
    a.p1.meter = 0;
    for (let i = 0; i < 10; i++) a.step(0);
    expect(a.p1.meter).toBe(0);
  });
});

describe('大蛇的全屏攻击', () => {
  it('对手站在舞台另一头也会被打到', () => {
    const a = arena(OROCHI, KYO, 40);
    a.p1.x = STAGE_LEFT + 10;
    a.p2.x = STAGE_RIGHT - 10;
    a.p1.meter = 100;
    for (const held of [D, D | R, R, D, D | R, R | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('236236A');
    for (let i = 0; i < 40 && a.p2.hp === a.p2.maxHp; i++) a.step(0);
    expect(a.p2.hp).toBeLessThan(a.p2.maxHp);
  });

  it('全屏技不可防（按住后退也掉血）', () => {
    const a = arena(OROCHI, KYO, 60);
    a.p1.meter = 100;
    for (const held of [D, D | R, R, D, D | R, R | Btn.A]) a.step(held);
    // P2 面朝左 → 后退方向是右
    for (let i = 0; i < 40 && a.p2.hp === a.p2.maxHp; i++) a.step(0, R);
    expect(a.p2.hp).toBeLessThan(a.p2.maxHp);
    expect(a.p2.state).not.toBe(FighterState.Block);
  });

  it('普通角色同距离打不到（对照组）', () => {
    const a = arena(KYO, KYO, 40);
    a.p1.x = STAGE_LEFT + 10;
    a.p2.x = STAGE_RIGHT - 10;
    a.p1.startMove(KYO.moves['5C']!);
    for (let i = 0; i < 30; i++) a.step(0);
    expect(a.p2.hp).toBe(a.p2.maxHp);
  });
});

describe('ゲーニッツ', () => {
  it('ヨルムンガンド 是慢速大気弾', () => {
    const a = arena(GOENITZ, KYO, 200);
    for (const held of [D, D | L, L | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('214A');
    expect(GOENITZ.moves['214A']!.projectile!.speed).toBeLessThan(3);
  });

  it('对空必杀有无敌帧', () => {
    expect(GOENITZ.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('两个超必杀气量正确', () => {
    expect(GOENITZ.moves['236236A']!.meterCost).toBe(50);
    expect(GOENITZ.moves['236236AC']!.meterCost).toBe(100);
  });
});
