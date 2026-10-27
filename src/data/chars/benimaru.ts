/**
 * 二阶堂红丸（KOF'97）：速度型，雷靭拳是飞行道具，居合蹴可以接反動三段蹴り。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';

const CANCELS = ['236A', '214B', '63214B', '236236A', '236236AC'];

export const BENIMARU: CharDef = {
  id: 'benimaru',
  name: '二阶堂红丸',
  palette: PALETTES['benimaru']!,
  hp: 980,
  walk: { fwd: 1.15, back: 0.95 }, // 走得快
  jump: { vy: 7.7, vx: 3.05, frames: 24 },
  boxes: {
    stand: { x: -12, y: -78, w: 24, h: 78 },
    crouch: { x: -12, y: -50, w: 24, h: 50 },
    air: { x: -10, y: -72, w: 20, h: 72 },
  },
  push: { w: 34 },
  moves: {
    '5A': mv('5A', '轻拳', 'benilightpunch', 12, 'normal', [
      hit('h1', { box: { x: 10, y: -64, w: 26, h: 10 }, frames: [3, 5], damage: 22 }),
    ], { cancel: { onHit: ['5B', '2B', ...CANCELS] } }),

    '5B': mv('5B', '轻脚', 'benilightkick', 16, 'normal', [
      hit('h1', { box: { x: 12, y: -46, w: 32, h: 12 }, frames: [5, 8], damage: 30, hitStun: 14, hitstop: 6 }),
    ], { cancel: { onHit: ['2B', ...CANCELS] } }),

    '5C': mv('5C', '重拳', 'beniheavypunch', 25, 'normal', [
      hit('h1', { box: { x: 14, y: -66, w: 30, h: 14 }, frames: [8, 11], damage: 68, hitStun: 18, blockStun: 12, hitstop: 9 }),
    ], { cancel: { onHit: CANCELS } }),

    '5D': mv('5D', '重脚', 'beniheavykick', 29, 'normal', [
      hit('h1', { box: { x: 12, y: -72, w: 36, h: 14 }, frames: [9, 12], damage: 76, hitStun: 18, blockStun: 12, hitstop: 9, level: 'high' }),
    ], { cancel: { onHit: CANCELS } }),

    '2A': mv('2A', '蹲轻拳', 'benicrouchpunch', 12, 'normal', [
      hit('h1', { box: { x: 10, y: -42, w: 24, h: 10 }, frames: [3, 5], damage: 20, hitstop: 4 }),
    ], { cancel: { onHit: ['2B', '236A'] } }),

    '2B': mv('2B', '蹲轻脚', 'benicrouchkick', 14, 'normal', [
      hit('h1', { box: { x: 8, y: -14, w: 32, h: 10 }, frames: [4, 7], damage: 24, guard: 'low', level: 'low' }),
    ], { cancel: { onHit: ['2B', '236A', '63214B'] } }),

    '2C': mv('2C', '蹲重拳', 'benicrouchpunch', 24, 'normal', [
      hit('h1', { box: { x: 8, y: -68, w: 26, h: 24 }, frames: [7, 10], damage: 66, hitStun: 18, blockStun: 12, hitstop: 9 }),
    ], { cancel: { onHit: CANCELS } }),

    '2D': mv('2D', '扫腿', 'benicrouchkick', 30, 'normal', [
      hit('h1', {
        box: { x: 8, y: -12, w: 36, h: 12 },
        frames: [8, 11],
        damage: 68,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
      }),
    ], { cancel: { onHit: ['236236A'] } }),

    'jA': mv('jA', '空中轻拳', 'benimarujumpattack', 20, 'normal', [
      hit('h1', { box: { x: 8, y: -52, w: 26, h: 12 }, frames: [4, 8], damage: 24, guard: 'overhead', level: 'overhead' }),
    ], { airborne: true, landingLag: 4 }),

    'jB': mv('jB', '空中轻脚', 'benimarujumpattack', 22, 'normal', [
      hit('h1', { box: { x: 10, y: -36, w: 28, h: 12 }, frames: [5, 9], damage: 28, guard: 'overhead', level: 'overhead' }),
    ], { airborne: true, landingLag: 4 }),

    'jC': mv('jC', '空中重拳', 'benimarujumpattack', 26, 'normal', [
      hit('h1', { box: { x: 10, y: -56, w: 28, h: 16 }, frames: [6, 10], damage: 58, guard: 'overhead', level: 'overhead', hitStun: 16, hitstop: 8 }),
    ], { airborne: true, landingLag: 6 }),

    'jD': mv('jD', '空中重脚', 'benimarujumpattack', 28, 'normal', [
      hit('h1', { box: { x: 12, y: -42, w: 30, h: 16 }, frames: [7, 11], damage: 62, guard: 'overhead', level: 'overhead', hitStun: 16, hitstop: 8 }),
    ], { airborne: true, landingLag: 6 }),

    '6B': mv('6B', 'ジャックナイフキック', 'kickLight', 30, 'command', [
      hit('h1', {
        box: { x: 14, y: -58, w: 30, h: 18 },
        frames: [10, 13],
        damage: 58,
        hitStun: 18,
        blockStun: 12,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['B'] } }),

    'CD': mv('CD', '吹飞攻击', 'kickHeavy', 36, 'system', [
      hit('h1', {
        box: { x: 12, y: -58, w: 34, h: 20 },
        frames: [12, 15],
        damage: 86,
        hitStun: 22,
        blockStun: 14,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ]),

    'AB': mv('AB', '紧急回避', 'roll', 26, 'system', [], {
      invuln: [{ frames: [1, 20], kind: 'full' }],
      travel: 92,
      travelFrames: 20,
      travelFollowInput: true,
    }),

    // ---------------------------------------------------------------- 必杀技
    '236A': mv('236A', '雷靭拳', 'benispecial1', 38, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: '雷靭拳',
        speed: 3.8,
        life: 80,
        spawnFrame: 11,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 22, h: 22 },
          frames: [1, 2],
          damage: 55,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          meterGain: 0,
        }),
      },
    }),

    '214B': mv('214B', '居合い蹴り', 'benispecial2', 34, 'special', [
      hit('h1', {
        box: { x: 14, y: -60, w: 34, h: 18 },
        frames: [10, 14],
        damage: 52,
        hitStun: 17,
        blockStun: 11,
        hitstop: 8,
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 40, travelFrames: 14, cancel: { onHit: ['236B'] } }),

    '236B': mv('236B', '反動三段蹴り', 'kickHeavy', 40, 'special', [
      hit('h1', { box: { x: 12, y: -58, w: 32, h: 16 }, frames: [8, 11], damage: 40, hitStun: 16, hitstop: 8, meterGain: 6 }),
      hit('h2', { box: { x: 14, y: -56, w: 34, h: 16 }, frames: [16, 19], damage: 40, hitStun: 18, hitstop: 8, meterGain: 6 }),
      hit('h3', {
        box: { x: 14, y: -62, w: 34, h: 18 },
        frames: [26, 30],
        damage: 46,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['B'] } }),

    '63214B': mv('63214B', '真空片手駒', 'benispecial3', 44, 'special', [
      hit('h1', { box: { x: 4, y: -70, w: 36, h: 50 }, frames: [8, 11], damage: 34, hitStun: 14, hitstop: 6, meterGain: 4 }),
      hit('h2', { box: { x: 4, y: -70, w: 36, h: 50 }, frames: [14, 17], damage: 32, hitStun: 14, hitstop: 6, meterGain: 4 }),
      hit('h3', {
        box: { x: 4, y: -70, w: 36, h: 50 },
        frames: [22, 26],
        damage: 36,
        hitStun: 20,
        hitstop: 8,
        knockdown: 'slam',
        meterGain: 4,
      }),
    ], { input: { motion: '63214', buttons: ['B'] } }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '雷光拳', 'benisuper', 58, 'super', [
      hit('h1', { box: { x: 10, y: -80, w: 40, h: 60 }, frames: [10, 14], damage: 50, hitStun: 18, hitstop: 9, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -80, w: 40, h: 60 }, frames: [22, 26], damage: 45, hitStun: 18, hitstop: 9, meterGain: 0 }),
      hit('h3', {
        box: { x: 10, y: -80, w: 40, h: 60 },
        frames: [34, 40],
        damage: 55,
        hitStun: 24,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '236236AC': mv('236236AC', '真・雷光拳', 'benisuper', 70, 'super', [
      hit('h1', { box: { x: 8, y: -82, w: 44, h: 62 }, frames: [8, 12], damage: 42, hitStun: 18, hitstop: 9, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -82, w: 44, h: 62 }, frames: [18, 22], damage: 40, hitStun: 18, hitstop: 9, meterGain: 0 }),
      hit('h3', { box: { x: 8, y: -82, w: 44, h: 62 }, frames: [28, 32], damage: 40, hitStun: 18, hitstop: 9, meterGain: 0 }),
      hit('h4', {
        box: { x: 8, y: -82, w: 44, h: 62 },
        frames: [44, 50],
        damage: 60,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100 }),
  },
};

export default BENIMARU;
