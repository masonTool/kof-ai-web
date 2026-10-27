/**
 * 大门五郎（KOF'97）：投技型，靠地雷震压起身、超大外刈抓人。
 * 数值口径同其他人：机制忠实、帧数与伤害近似。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';

const CANCELS = ['214A', '63214B', '236236A'];

export const DAIMON: CharDef = {
  id: 'daimon',
  name: '大门五郎',
  palette: PALETTES['daimon']!,
  hp: 1060, // 血厚
  walk: { fwd: 0.88, back: 0.75 }, // 走得慢
  jump: { vy: 7.2, vx: 2.6, frames: 26 },
  boxes: {
    stand: { x: -13, y: -82, w: 26, h: 82 },
    crouch: { x: -13, y: -54, w: 26, h: 54 },
    air: { x: -11, y: -74, w: 22, h: 74 },
  },
  push: { w: 38 },
  moves: {
    '5A': mv('5A', '轻拳', 'daimonlightpunch', 14, 'normal', [
      hit('h1', { box: { x: 10, y: -66, w: 26, h: 10 }, frames: [4, 6], damage: 26, hitStun: 13, hitstop: 5 }),
    ], { cancel: { onHit: ['5B', '2B', ...CANCELS] } }),

    '5B': mv('5B', '轻脚', 'daimonlightkick', 18, 'normal', [
      hit('h1', { box: { x: 12, y: -48, w: 32, h: 12 }, frames: [6, 9], damage: 34, hitStun: 14, hitstop: 6 }),
    ], { cancel: { onHit: ['2B', ...CANCELS] } }),

    '5C': mv('5C', '重拳', 'daimonheavypunch', 28, 'normal', [
      hit('h1', { box: { x: 14, y: -68, w: 30, h: 16 }, frames: [9, 12], damage: 78, hitStun: 19, blockStun: 12, hitstop: 10 }),
    ], { cancel: { onHit: CANCELS } }),

    '5D': mv('5D', '重脚', 'daimonheavykick', 32, 'normal', [
      hit('h1', { box: { x: 12, y: -74, w: 34, h: 16 }, frames: [10, 13], damage: 84, hitStun: 19, blockStun: 13, hitstop: 10, level: 'high' }),
    ], { cancel: { onHit: CANCELS } }),

    '2A': mv('2A', '蹲轻拳', 'daimoncrouchpunch', 13, 'normal', [
      hit('h1', { box: { x: 10, y: -44, w: 24, h: 10 }, frames: [4, 6], damage: 24, hitstop: 4 }),
    ], { cancel: { onHit: ['2B', '214A'] } }),

    '2B': mv('2B', '蹲轻脚', 'daimoncrouchkick', 16, 'normal', [
      hit('h1', { box: { x: 8, y: -16, w: 32, h: 10 }, frames: [5, 8], damage: 28, guard: 'low', level: 'low' }),
    ], { cancel: { onHit: ['214A', '63214B'] } }),

    '2C': mv('2C', '蹲重拳', 'daimoncrouchpunch', 26, 'normal', [
      hit('h1', { box: { x: 8, y: -70, w: 28, h: 26 }, frames: [8, 11], damage: 74, hitStun: 19, blockStun: 12, hitstop: 10 }),
    ], { cancel: { onHit: CANCELS } }),

    '2D': mv('2D', '扫腿', 'daimoncrouchkick', 32, 'normal', [
      hit('h1', {
        box: { x: 8, y: -14, w: 38, h: 12 },
        frames: [9, 12],
        damage: 76,
        hitStun: 20,
        blockStun: 13,
        hitstop: 10,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
      }),
    ], { cancel: { onHit: ['236236A'] } }),

    'jA': mv('jA', '空中轻拳', 'daimonjumpattack', 22, 'normal', [
      hit('h1', { box: { x: 8, y: -54, w: 26, h: 12 }, frames: [5, 9], damage: 26, guard: 'overhead', level: 'overhead' }),
    ], { airborne: true, landingLag: 5 }),

    'jB': mv('jB', '空中轻脚', 'daimonjumpattack', 24, 'normal', [
      hit('h1', { box: { x: 10, y: -38, w: 28, h: 14 }, frames: [6, 10], damage: 32, guard: 'overhead', level: 'overhead' }),
    ], { airborne: true, landingLag: 5 }),

    'jC': mv('jC', '空中重拳', 'daimonjumpattack', 28, 'normal', [
      hit('h1', { box: { x: 10, y: -58, w: 30, h: 18 }, frames: [7, 11], damage: 66, guard: 'overhead', level: 'overhead', hitStun: 17, hitstop: 9 }),
    ], { airborne: true, landingLag: 7 }),

    'jD': mv('jD', '空中重脚', 'daimonjumpattack', 30, 'normal', [
      hit('h1', { box: { x: 12, y: -44, w: 32, h: 18 }, frames: [8, 12], damage: 70, guard: 'overhead', level: 'overhead', hitStun: 17, hitstop: 9 }),
    ], { airborne: true, landingLag: 7 }),

    '6B': mv('6B', '頭上払い', 'punchHeavy', 32, 'command', [
      hit('h1', {
        box: { x: 14, y: -70, w: 32, h: 20 },
        frames: [11, 14],
        damage: 62,
        hitStun: 19,
        blockStun: 13,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['B'] } }),

    'CD': mv('CD', '吹飞攻击', 'kickHeavy', 38, 'system', [
      hit('h1', {
        box: { x: 12, y: -60, w: 36, h: 22 },
        frames: [13, 16],
        damage: 94,
        hitStun: 22,
        blockStun: 14,
        hitstop: 13,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ]),

    'AB': mv('AB', '紧急回避', 'roll', 28, 'system', [], {
      invuln: [{ frames: [1, 20], kind: 'full' }],
      travel: 84,
      travelFrames: 22,
      travelFollowInput: true,
    }),

    // ---------------------------------------------------------------- 必杀技
    // 地雷震：砸地，下段、击倒，打不到空中
    '214A': mv('214A', '地雷震', 'daimonspecial1', 40, 'special', [
      hit('h1', {
        box: { x: 0, y: -10, w: 96, h: 14 },
        frames: [14, 20],
        damage: 70,
        hitStun: 22,
        blockStun: 14,
        hitstop: 11,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
        meterGain: 8,
      }),
    ], { input: { motion: '214', buttons: ['A'] } }),

    // 超大外刈：贴身抓，不可防
    '63214B': mv('63214B', '超大外刈', 'daimonspecial2', 48, 'throw', [
      hit('h1', {
        box: { x: 4, y: -62, w: 30, h: 46 },
        frames: [6, 9],
        damage: 108,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '63214', buttons: ['B'] }, blockable: false }),

    // ---------------------------------------------------------------- 超必杀
    // 地獄極楽落とし：不可防的抓取超必杀
    '236236A': mv('236236A', '地獄極楽落とし', 'daimonsuper', 66, 'super', [
      hit('h1', {
        box: { x: 4, y: -62, w: 32, h: 48 },
        frames: [8, 12],
        damage: 60,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        meterGain: 0,
      }),
      hit('h2', {
        box: { x: 4, y: -62, w: 32, h: 48 },
        frames: [22, 26],
        damage: 55,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        meterGain: 0,
      }),
      hit('h3', {
        box: { x: -20, y: -70, w: 70, h: 50 },
        frames: [38, 44],
        damage: 80,
        hitStun: 30,
        hitstop: 14,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 100, blockable: false }),
  },
};

export default DAIMON;
