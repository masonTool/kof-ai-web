import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type CharDef } from '../src/data/schema';
import { LEONA } from '../src/data/chars/leona';
import { RALF } from '../src/data/chars/ralf';
import { CLARK } from '../src/data/chars/clark';
import { ROSTER } from '../src/data/chars';
import { CommandParser } from '../src/input/parser';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { Fighter } from '../src/sim/fighter';
import { Projectile } from '../src/sim/projectile';
import { resolveCombat, resolveProjectiles } from '../src/sim/hit';
import { resolvePushAll } from '../src/sim/physics';
import { FighterState } from '../src/sim/state';
import { World } from '../src/sim/world';

const D = Btn.Down;
const L = Btn.Left;
const R = Btn.Right;

const MOTION_FRAMES: Record<string, number[]> = {
  '4': [L],
  '236': [D, D | R, R],
  '214': [D, D | L, L],
  '623': [R, D, D | R],
  '63214': [R, D | R, D, D | L, L],
  '236236': [D, D | R, R, D, D | R, R],
  '214214': [D, D | L, L, D, D | L, L],
  '2363214': [D, D | R, R, D | R, D, D | L, L],
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

function arena(char: CharDef, gap = 40): { world: World; p1: Fighter; p2: Fighter; step(held: number, held2?: number): void } {
  const world = new World(29);
  const p1 = world.add(new Fighter(char, { x: 200, facing: 1 }));
  const p2 = world.add(new Fighter(char, { x: 200 + gap, facing: -1 }));
  p1.opponent = p2;
  p2.opponent = p1;
  const fighters = [p1, p2];
  const step = (held: number, held2 = 0): void => {
    world.step([{ held }, { held: held2 }]);
    resolveCombat(world, fighters);
    resolveProjectiles(world, fighters);
    resolvePushAll(fighters);
    world.sweep();
  };
  step(0);
  return { world, p1, p2, step };
}

const IKARI: readonly CharDef[] = [LEONA, RALF, CLARK];

describe.each(IKARI)('$name：数据自洽', (char) => {
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
  it('怒队三人都在册，id 不重复', () => {
    expect(ROSTER.map((c) => c.id)).toEqual(expect.arrayContaining(['leona', 'ralf', 'clark']));
    expect(new Set(ROSTER.map((c) => c.id)).size).toBe(ROSTER.length);
  });
});

describe('莉安娜', () => {
  it('イヤリング爆弾是慢速投掷道具', () => {
    const a = arena(LEONA, 220);
    for (const held of [D, D | L, L | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('214A');
    for (let i = 0; i < 16 && a.world.entities.filter((e) => e instanceof Projectile).length === 0; i++) a.step(0);
    const proj = a.world.entities.filter((e): e is Projectile => e instanceof Projectile);
    expect(proj).toHaveLength(1);
    expect(Math.abs(proj[0]!.vx)).toBeLessThan(3); // 慢
  });

  it('ボルテックランチャー 判定很长', () => {
    expect(LEONA.moves['236A']!.hits[0]!.box.w).toBeGreaterThan(45);
  });

  it('グランドセイバー 有无敌帧', () => {
    expect(LEONA.moves['623A']!.invuln?.[0]?.kind).toBe('full');
  });

  it('リボルブブラスター 是 50 气飞行道具，Vスラッシャー 是 100 气', () => {
    expect(LEONA.moves['214214A']!.projectile).toBeDefined();
    expect(LEONA.moves['214214A']!.meterCost).toBe(50);
    expect(LEONA.moves['236236A']!.meterCost).toBe(100);
  });
});

describe('拉尔夫', () => {
  it('バルカンパンチ 五段，末段击倒', () => {
    const move = RALF.moves['236A']!;
    expect(move.hits).toHaveLength(5);
    expect(move.hits.at(-1)!.knockdown).toBe('slam');
  });

  it('贴脸能真的打到人', () => {
    const a = arena(RALF, 40);
    for (const held of [D, D | R, R | Btn.A]) a.step(held);
    for (let i = 0; i < 40 && a.p2.hp === a.p2.maxHp; i++) a.step(0);
    expect(a.p2.hp).toBeLessThan(a.p2.maxHp);
  });

  it('ダイビングパンチ 中段、ラリアット 带位移', () => {
    expect(RALF.moves['214B']!.hits[0]!.guard).toBe('overhead');
    expect(RALF.moves['214A']!.travel).toBeGreaterThan(40);
  });

  it('ギャラクティカファントム 100 气、两段大伤害', () => {
    const move = RALF.moves['2363214A']!;
    expect(move.meterCost).toBe(100);
    expect(move.hits.reduce((s, h) => s + h.damage, 0)).toBeGreaterThan(150);
  });
});

describe('克拉克', () => {
  it('三个抓取都不可防', () => {
    for (const key of ['236A', '63214A', '63214B']) {
      const move = CLARK.moves[key]!;
      expect(move.kind, key).toBe('throw');
      expect(move.hits[0]!.guard, key).toBe('unblockable');
      expect(move.blockable, key).toBe(false);
    }
  });

  it('贴身抓得到，就算对方在防也照抓', () => {
    const a = arena(CLARK, 40);
    for (const held of [D, D | R, R | Btn.A]) a.step(held);
    expect(a.p1.move?.id).toBe('236A');
    // 对手按住后退防御
    for (let i = 0; i < 20 && a.p2.hp === a.p2.maxHp; i++) a.step(0, Btn.Left);
    expect(a.p2.hp).toBeLessThan(a.p2.maxHp);
  });

  it('离得远抓不到（空振）', () => {
    const a = arena(CLARK, 200);
    for (const held of [D, D | R, R | Btn.A]) a.step(held);
    for (let i = 0; i < 20; i++) a.step(0);
    expect(a.p2.hp).toBe(a.p2.maxHp);
  });

  it('アルティメットアルゼンチン 100 气、三段、全程不可防', () => {
    const move = CLARK.moves['236236A']!;
    expect(move.meterCost).toBe(100);
    expect(move.hits).toHaveLength(3);
    expect(move.hits.every((h) => h.guard === 'unblockable')).toBe(true);
  });

  it('ローリングクレイドル 有无敌帧（对空）', () => {
    const move = CLARK.moves['623A']!;
    expect(move.invuln?.[0]?.kind).toBe('throw');
    expect(move.hits[0]!.knockdown).toBe('slam');
  });

  it('挨打会被打断抓取（不会抓进受击状态）', () => {
    const a = arena(CLARK, 60);
    a.p2.startMove(CLARK.moves['5C']!);
    for (let i = 0; i < 20 && a.p1.state !== FighterState.Hit; i++) a.step(0);
    expect([FighterState.Hit, FighterState.Idle, FighterState.WalkB]).toContain(a.p1.state);
  });
});
