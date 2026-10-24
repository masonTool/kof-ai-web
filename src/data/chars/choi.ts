/**
 * 蔡宝奇（KOF'97）：全游戏最矮最快的角色，靠爪子和旋风。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals } from './template';

const CANCELS = ['236A', '623A', '214A', '236236A', '236236AC'];

export const CHOI: CharDef = {
  id: 'choi',
  name: '蔡宝奇',
  palette: PALETTES['choi']!,
  hp: 940, // 最脆
  walk: { fwd: 1.22, back: 1.02 }, // 最快
  jump: { vy: 8.0, vx: 3.15, frames: 22 },
  // 最矮：很多高段技直接从他头顶过去
  boxes: {
    stand: { x: -10, y: -58, w: 20, h: 58 },
    crouch: { x: -10, y: -40, w: 20, h: 40 },
    air: { x: -8, y: -54, w: 16, h: 54 },
  },
  push: { w: 28 },
  moves: {
    ...buildNormals({ power: 0.88, speed: 0.88, reach: 0.9, cancels: CANCELS }),

    // ---------------------------------------------------------------- 必杀技
    // 旋風斬：转着往前冲（多段）
    '236A': mv('236A', '旋風斬', 'kickLight', 48, 'special', [
      hit('h1', { box: { x: 8, y: -60, w: 30, h: 30 }, frames: [8, 11], damage: 26, hitStun: 14, hitstop: 6, meterGain: 4 }),
      hit('h2', { box: { x: 8, y: -60, w: 30, h: 30 }, frames: [14, 17], damage: 24, hitStun: 14, hitstop: 6, meterGain: 4 }),
      hit('h3', { box: { x: 8, y: -62, w: 32, h: 32 }, frames: [20, 23], damage: 24, hitStun: 14, hitstop: 6, meterGain: 4 }),
      hit('h4', {
        box: { x: 8, y: -66, w: 34, h: 36 },
        frames: [28, 33],
        damage: 36,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, travel: 82, travelFrames: 28 }),

    // 飛翔空裂斬：对空上冲（爪）
    '623A': mv('623A', '飛翔空裂斬', 'kickLight', 40, 'special', [
      hit('h1', { box: { x: 4, y: -78, w: 26, h: 46 }, frames: [4, 8], damage: 28, hitStun: 16, hitstop: 6, meterGain: 5 }),
      hit('h2', {
        box: { x: 4, y: -84, w: 28, h: 56 },
        frames: [10, 16],
        damage: 38,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // 疾風斬：低空突进（下段）
    '214A': mv('214A', '疾風斬', 'crouchKick', 38, 'special', [
      hit('h1', {
        box: { x: 10, y: -22, w: 32, h: 18 },
        frames: [10, 14],
        damage: 52,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, travel: 72, travelFrames: 16 }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '真！超絶竜巻斬', 'special', 70, 'super', [
      hit('h1', { box: { x: 8, y: -62, w: 32, h: 34 }, frames: [8, 11], damage: 28, hitStun: 15, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -62, w: 32, h: 34 }, frames: [15, 18], damage: 26, hitStun: 15, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 8, y: -66, w: 34, h: 38 }, frames: [22, 25], damage: 26, hitStun: 15, hitstop: 6, meterGain: 0 }),
      hit('h4', { box: { x: 8, y: -70, w: 36, h: 42 }, frames: [29, 32], damage: 26, hitStun: 15, hitstop: 6, meterGain: 0 }),
      hit('h5', {
        box: { x: 6, y: -76, w: 38, h: 50 },
        frames: [44, 50],
        damage: 48,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50, travel: 66, travelFrames: 16 }),

    '236236AC': mv('236236AC', '真！超絶竜巻斬 MAX', 'special', 82, 'super', [
      hit('h1', { box: { x: 8, y: -62, w: 34, h: 36 }, frames: [6, 9], damage: 26, hitStun: 15, hitstop: 5, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -62, w: 34, h: 36 }, frames: [12, 15], damage: 24, hitStun: 15, hitstop: 5, meterGain: 0 }),
      hit('h3', { box: { x: 8, y: -66, w: 36, h: 40 }, frames: [18, 21], damage: 24, hitStun: 15, hitstop: 5, meterGain: 0 }),
      hit('h4', { box: { x: 8, y: -68, w: 36, h: 42 }, frames: [24, 27], damage: 24, hitStun: 15, hitstop: 5, meterGain: 0 }),
      hit('h5', { box: { x: 6, y: -72, w: 38, h: 46 }, frames: [30, 33], damage: 24, hitStun: 15, hitstop: 5, meterGain: 0 }),
      hit('h6', {
        box: { x: 6, y: -80, w: 40, h: 54 },
        frames: [50, 58],
        damage: 58,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100, travel: 76, travelFrames: 20 }),
  },
};

export default CHOI;
