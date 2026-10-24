/**
 * 夏尔米（KOF'97）：雷电 + 投技，抓人狠、收招慢。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '63214B', '214A', '236236A', '236236AC'];

export const SHERMIE: CharDef = {
  id: 'shermie',
  name: '夏尔米',
  palette: PALETTES['shermie']!,
  hp: 1000,
  walk: { fwd: 1.0, back: 0.88 },
  jump: { vy: 7.5, vx: 2.9, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    ...buildNormals({ power: 1.02, speed: 1.04, reach: 1.0, cancels: CANCELS }),

    // ---------------------------------------------------------------- 必杀技
    // シェルミーフラッシュ：雷电突进
    '236A': mv('236A', 'シェルミーフラッシュ', 'special', 38, 'special', [
      hit('h1', {
        box: { x: 12, y: -66, w: 36, h: 30 },
        frames: [11, 15],
        damage: 62,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, travel: 54, travelFrames: 15 }),

    // シェルミースパイラル：抓起来摔（不可防）
    '63214B': mv('63214B', 'シェルミースパイラル', 'throwStart', 54, 'throw', [
      hit('h1', {
        box: { x: 4, y: -64, w: 32, h: 48 },
        frames: [8, 12],
        damage: 116,
        hitStun: 30,
        blockStun: 0,
        hitstop: 13,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '63214', buttons: ['B'] }, blockable: false }),

    // アクセルスピンナー：原地回旋踢
    '214A': mv('214A', 'アクセルスピンナー', 'kickHeavy', 40, 'special', [
      hit('h1', { box: { x: 10, y: -66, w: 32, h: 24 }, frames: [9, 12], damage: 30, hitStun: 15, hitstop: 6, meterGain: 5 }),
      hit('h2', {
        box: { x: 10, y: -70, w: 34, h: 30 },
        frames: [16, 21],
        damage: 44,
        hitStun: 21,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['A'] } }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', 'シェルミーパラダイス', 'throwStart', 70, 'super', [
      hit('h1', {
        box: { x: 4, y: -66, w: 34, h: 50 },
        frames: [8, 12],
        damage: 70,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        meterGain: 0,
      }),
      hit('h2', {
        box: { x: 4, y: -66, w: 34, h: 50 },
        frames: [22, 28],
        damage: 60,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        meterGain: 0,
      }),
      hit('h3', {
        box: { x: -22, y: -74, w: 74, h: 56 },
        frames: [42, 50],
        damage: 88,
        hitStun: 30,
        hitstop: 16,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 100, blockable: false }),

    '236236AC': mv('236236AC', 'シェルミーフラッシュ MAX', 'special', 64, 'super', [
      hit('h1', { box: { x: 10, y: -70, w: 38, h: 34 }, frames: [8, 12], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -72, w: 40, h: 38 }, frames: [18, 22], damage: 32, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h3', {
        box: { x: 8, y: -80, w: 44, h: 50 },
        frames: [38, 44],
        damage: 52,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 50, travel: 40, travelFrames: 12 }),
  },
};

export default SHERMIE;
