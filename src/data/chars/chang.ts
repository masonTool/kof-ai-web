/**
 * 陈国汉（KOF'97）：铁球大汉，体型最大、判定最远，但慢得像推土机。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals } from './template';

const CANCELS = ['236A', '214A', '63214A', '236236A', '236236AC'];

export const CHANG: CharDef = {
  id: 'chang',
  name: '陈国汉',
  palette: PALETTES['chang']!,
  hp: 1120, // 全场最厚
  walk: { fwd: 0.72, back: 0.62 }, // 全场最慢
  jump: { vy: 7.0, vx: 2.4, frames: 28 },
  // 大块头：受击盒又宽又高，但也因此更容易被打到
  boxes: {
    stand: { x: -17, y: -88, w: 34, h: 88 },
    crouch: { x: -17, y: -58, w: 34, h: 58 },
    air: { x: -15, y: -80, w: 30, h: 80 },
  },
  push: { w: 44 },
  moves: {
    ...buildNormals({ power: 1.18, speed: 1.12, reach: 1.16, cancels: CANCELS, anim: { heavyPunch: 'changheavypunch', heavyKick: 'changheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // 鉄球大回転：抡球连打（四段）
    '236A': mv('236A', '鉄球大回転', 'changspecial1', 52, 'special', [
      hit('h1', { box: { x: 14, y: -70, w: 40, h: 34 }, frames: [10, 13], damage: 34, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h2', { box: { x: 14, y: -70, w: 40, h: 34 }, frames: [17, 20], damage: 32, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h3', { box: { x: 14, y: -72, w: 42, h: 36 }, frames: [24, 27], damage: 32, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h4', {
        box: { x: 12, y: -76, w: 46, h: 42 },
        frames: [34, 40],
        damage: 48,
        hitStun: 22,
        hitstop: 11,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    // 鉄球大圧殺：跳起砸球（中段）
    '214A': mv('214A', '鉄球大圧殺', 'changspecial2', 44, 'special', [
      hit('h1', {
        box: { x: 10, y: -74, w: 44, h: 40 },
        frames: [15, 19],
        damage: 68,
        hitStun: 21,
        blockStun: 13,
        hitstop: 10,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 8,
      }),
    ], { input: { motion: '214', buttons: ['A'] } }),

    // 大破壊投げ：贴身抓
    '63214A': mv('63214A', '大破壊投げ', 'changspecial3', 56, 'throw', [
      hit('h1', {
        box: { x: 4, y: -70, w: 38, h: 54 },
        frames: [8, 12],
        damage: 118,
        hitStun: 30,
        blockStun: 0,
        hitstop: 13,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '63214', buttons: ['A'] }, blockable: false }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '鉄球大回転・乱', 'changsuper', 66, 'super', [
      hit('h1', { box: { x: 12, y: -72, w: 42, h: 36 }, frames: [8, 11], damage: 32, hitStun: 15, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -72, w: 42, h: 36 }, frames: [16, 19], damage: 30, hitStun: 15, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 12, y: -74, w: 44, h: 38 }, frames: [24, 27], damage: 30, hitStun: 15, hitstop: 6, meterGain: 0 }),
      hit('h4', {
        box: { x: 10, y: -78, w: 48, h: 44 },
        frames: [40, 46],
        damage: 54,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '236236AC': mv('236236AC', '鉄球大暴走', 'changsuper', 82, 'super', [
      hit('h1', { box: { x: 10, y: -76, w: 44, h: 40 }, frames: [10, 14], damage: 36, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -76, w: 44, h: 40 }, frames: [20, 24], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -78, w: 46, h: 42 }, frames: [30, 34], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h4', { box: { x: 8, y: -80, w: 48, h: 46 }, frames: [40, 44], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h5', {
        box: { x: 6, y: -84, w: 52, h: 52 },
        frames: [58, 66],
        damage: 66,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100, travel: 54, travelFrames: 20 }),
  },
};

export default CHANG;
