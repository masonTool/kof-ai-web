/**
 * 克里斯（KOF'97）：火焰，动作最轻快，血最少。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214B', '623A', '236236A', '236236AC'];

export const CHRIS: CharDef = {
  id: 'chris',
  name: '克里斯',
  palette: PALETTES['chris']!,
  hp: 960,
  walk: { fwd: 1.16, back: 0.98 },
  jump: { vy: 7.8, vx: 3.05, frames: 23 },
  boxes: standardBoxes(),
  push: { w: 33 },
  moves: {
    ...buildNormals({ power: 0.94, speed: 0.92, reach: 0.98, cancels: CANCELS, anim: { crouchPunch: 'chriscrouchpunch', crouchKick: 'chriscrouchkick', heavyPunch: 'chrisheavypunch', heavyKick: 'chrisheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // クリスフレイム：火焰弹（飞行道具）
    '236A': mv('236A', 'クリスフレイム', 'chrisspecial1', 36, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: 'クリスフレイム',
        speed: 3.6,
        life: 80,
        spawnFrame: 10,
        spawnOffsetY: -42,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 26, h: 24 },
          frames: [1, 2],
          damage: 52,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          meterGain: 0,
        }),
      },
    }),

    // スライディング：低身滑铲（下段）
    '214B': mv('214B', 'スライディング', 'chrisspecial2', 34, 'special', [
      hit('h1', {
        box: { x: 10, y: -20, w: 34, h: 16 },
        frames: [9, 13],
        damage: 48,
        hitStun: 18,
        blockStun: 11,
        hitstop: 8,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 62, travelFrames: 14 }),

    // フレイムアッパー：对空火焰拳
    '623A': mv('623A', 'フレイムアッパー', 'chrisspecial3', 38, 'special', [
      hit('h1', {
        box: { x: 6, y: -86, w: 28, h: 58 },
        frames: [4, 10],
        damage: 62,
        hitStun: 21,
        blockStun: 13,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', 'クリスフレイム MAX', 'chrissuper', 64, 'super', [
      hit('h1', { box: { x: 10, y: -74, w: 36, h: 30 }, frames: [8, 11], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -76, w: 36, h: 34 }, frames: [15, 18], damage: 26, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -78, w: 38, h: 38 }, frames: [22, 25], damage: 26, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h4', {
        box: { x: 8, y: -84, w: 42, h: 50 },
        frames: [42, 48],
        damage: 52,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50, travel: 44, travelFrames: 12 }),

    '236236AC': mv('236236AC', '炎の大蛇', 'chrissuper', 76, 'super', [], {
      input: { motion: '236236', buttons: ['A', 'C'] },
      meterCost: 100,
      projectile: {
        anim: '炎の大蛇',
        speed: 4.8,
        life: 110,
        spawnFrame: 16,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 44, h: 40 },
          frames: [1, 2],
          damage: 130,
          hitStun: 26,
          blockStun: 16,
          hitstop: 14,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),
  },
};

export default CHRIS;
