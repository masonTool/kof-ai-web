import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { validateChar, type InputSpec, type MoveDef } from '../src/data/schema';
import { KYO } from '../src/data/chars/kyo';
import { PALETTES, paletteFor } from '../src/data/chars/palette';
import { hasPose, validateCharPoses } from '../src/render/poses';
import { CommandParser } from '../src/input/parser';

const D = Btn.Down;
const L = Btn.Left;
const R = Btn.Right;

const NORMALS = ['5A', '5B', '5C', '5D', '2A', '2B', '2C', '2D'];
const AIR_NORMALS = ['jA', 'jB', 'jC', 'jD'];
const SPECIALS = ['236A', '236C', '623P', '214K', '421K'];
const SUPERS = ['236236P', '236236AC'];

/** 每条指令对应的方向帧序列（面朝右） */
const MOTION_FRAMES: Record<string, number[]> = {
  '236': [D, D | R, R],
  '214': [D, D | L, L],
  '421': [L, D, D | L], // ←↓↙
  '623': [R, D, D | R],
  '236236': [D, D | R, R, D, D | R, R],
  '6': [R],
  '4': [L],
  '3': [D | R],
};

/** 用指令 + 按键帧喂出一个 CommandParser */
function parserFor(spec: InputSpec): CommandParser {
  const parser = new CommandParser(1);
  const frames = MOTION_FRAMES[spec.motion];
  if (!frames) throw new Error(`测试没有为指令 ${spec.motion} 准备方向序列`);
  let prev = 0;
  const all = [...frames];
  // 最后一帧同时按下按键
  let mask = 0;
  for (const b of spec.buttons ?? []) {
    mask |= { A: Btn.A, B: Btn.B, C: Btn.C, D: Btn.D }[b];
  }
  all[all.length - 1] = all[all.length - 1]! | mask;
  for (const held of all) {
    parser.push(edges(held, prev));
    prev = held;
  }
  return parser;
}

describe('草薙京：数据自洽', () => {
  it('整张表通过校验（帧数、断言盒、取消引用、键名）', () => {
    expect(validateChar(KYO)).toEqual([]);
  });

  it('所有招式引用的姿势都存在', () => {
    expect(validateCharPoses(KYO)).toEqual([]);
    for (const move of Object.values(KYO.moves)) expect(hasPose(move.anim), move.id).toBe(true);
  });

  it('每个招式的 total 都不小于判定结束帧', () => {
    for (const move of Object.values(KYO.moves)) {
      for (const h of move.hits) {
        expect(h.frames[1], `${move.id}/${h.id}`).toBeLessThan(move.total);
      }
    }
  });

  it('基础属性合理', () => {
    expect(KYO.hp).toBeGreaterThan(0);
    expect(KYO.walk.fwd).toBeGreaterThan(0);
    expect(KYO.walk.back).toBeGreaterThan(0);
    expect(KYO.push?.w).toBeGreaterThan(0);
    expect(KYO.palette).toEqual(PALETTES['kyo']);
    expect(paletteFor('kyo')).toBe(PALETTES['kyo']);
    expect(paletteFor('还没做的角色')).toBeTruthy();
  });
});

describe('草薙京：招式齐全', () => {
  it('八个站/蹲通常技 + 四个空中技 + 吹飞', () => {
    for (const key of NORMALS) {
      const move = KYO.moves[key];
      expect(move, key).toBeDefined();
      expect(move!.kind, key).toBe('normal');
    }
    for (const key of AIR_NORMALS) {
      expect(KYO.moves[key]!.airborne, key).toBe(true);
    }
    expect(KYO.moves['CD']!.kind).toBe('system');
  });

  it('五个必杀技，指令都写对了', () => {
    const expected: Record<string, InputSpec> = {
      '236A': { motion: '236', buttons: ['A'] },
      '236C': { motion: '236', buttons: ['C'] },
      '623P': { motion: '623', buttons: ['A'] },
      '214K': { motion: '214', buttons: ['D'] },
      '421K': { motion: '421', buttons: ['B'] },
    };
    for (const key of SPECIALS) {
      const move = KYO.moves[key]!;
      expect(move.kind, key).toBe('special');
      expect(move.input, key).toEqual(expected[key]);
      expect(move.meterCost ?? 0, key).toBe(0);
    }
  });

  it('两个超必杀，都要吃气槽', () => {
    for (const key of SUPERS) {
      const move = KYO.moves[key]!;
      expect(move.kind, key).toBe('super');
      expect(move.meterCost, key).toBeGreaterThan(0);
      expect(move.hits.length, key).toBeGreaterThan(1); // 多段
    }
    expect(KYO.moves['236236P']!.meterCost).toBe(50);
    expect(KYO.moves['236236AC']!.meterCost).toBe(100);
  });

  it('指令通常技与投技都在', () => {
    expect(KYO.moves['6B']!.kind).toBe('command');
    expect(KYO.moves['3D']!.kind).toBe('command');
    expect(KYO.moves['throw']!.kind).toBe('throw');
    expect(KYO.moves['throw']!.hits[0]!.guard).toBe('unblockable');
    expect(KYO.moves['throw']!.blockable).toBe(false);
  });
});

describe('草薙京：判定属性', () => {
  it('下段技必须蹲防、空中技必须站防', () => {
    for (const key of ['2B', '2D', '3D']) {
      expect(KYO.moves[key]!.hits[0]!.guard, key).toBe('low');
      expect(KYO.moves[key]!.hits[0]!.level, key).toBe('low');
    }
    for (const key of [...AIR_NORMALS, '6B', '421K']) {
      expect(KYO.moves[key]!.hits[0]!.guard, key).toBe('overhead');
    }
  });

  it('鬼焼き有无敌帧，扫腿/吹飞会击倒', () => {
    expect(KYO.moves['623P']!.invuln?.[0]?.kind).toBe('full');
    expect(KYO.moves['2D']!.hits[0]!.knockdown).toBe('trip');
    expect(KYO.moves['CD']!.hits[0]!.knockdown).toBe('slam');
  });

  it('通常技命中后能取消进必杀技', () => {
    const cancels = KYO.moves['5C']!.cancel?.onHit ?? [];
    expect(cancels).toContain('236A');
    expect(cancels).toContain('623P');
    expect(cancels).toContain('214K');
    expect(cancels).toContain('236236P');
    for (const ref of cancels) expect(KYO.moves[ref], ref).toBeDefined();
  });

  it('荒咬与毒咬的连段链是闭合的', () => {
    expect(KYO.moves['236A']!.cancel?.onHit).toEqual(['236A_2']);
    expect(KYO.moves['236A_2']!.cancel?.onHit).toEqual(['236A_3']);
    expect(KYO.moves['236A_3']!.cancel?.onHit).toBeUndefined();
    expect(KYO.moves['236C']!.cancel?.onHit).toEqual(['236C_2']);
    expect(KYO.moves['236C_2']!.cancel?.onHit).toEqual(['236C_3']);
  });

  it('超必杀的总伤害明显高于通常技', () => {
    const total = (m: MoveDef): number => m.hits.reduce((sum, h) => sum + h.damage, 0);
    expect(total(KYO.moves['236236P']!)).toBeGreaterThan(total(KYO.moves['5C']!) * 1.5);
    expect(total(KYO.moves['236236AC']!)).toBeGreaterThan(total(KYO.moves['236236P']!));
  });
});

describe('草薙京：指令真的能按出来', () => {
  it('每个带指令的招式都能被输入解析识别', () => {
    for (const [key, move] of Object.entries(KYO.moves)) {
      if (!move.input) continue;
      const parser = parserFor(move.input);
      expect(parser.match(move.input), `${key} 的指令 ${move.input.motion}`).toBe(true);
    }
  });

  it('指令写错方向就出不来（反向不成立）', () => {
    const move = KYO.moves['236A']!;
    const parser = new CommandParser(1);
    let prev = 0;
    for (const held of [D, D | L, L | Btn.A]) {
      parser.push(edges(held, prev));
      prev = held;
    }
    expect(parser.match(move.input!)).toBe(false);
  });

  it('朝左时同一套指令依然成立（指令是朝向相对的）', () => {
    const move = KYO.moves['236A']!;
    const parser = new CommandParser(-1);
    let prev = 0;
    for (const held of [D, D | L, L | Btn.A]) {
      parser.push(edges(held, prev));
      prev = held;
    }
    expect(parser.match(move.input!)).toBe(true);
  });
});
