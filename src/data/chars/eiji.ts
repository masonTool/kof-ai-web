/**
 * 如月影二（KOF'97）：忍者，位移多、出手快，但伤害偏低。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214A', '623A', '63214B', '236236A', '236236AC'];

export const EIJI: CharDef = {
  id: 'eiji',
  name: '如月影二',
  palette: PALETTES['eiji']!,
  hp: 970,
  walk: { fwd: 1.16, back: 0.98 },
  jump: { vy: 7.7, vx: 3.05, frames: 23 },
  boxes: standardBoxes(),
  push: { w: 33 },
  moves: {
    ...buildNormals({ power: 0.94, speed: 0.9, reach: 1.0, cancels: CANCELS }),

    // ---------------------------------------------------------------- 必杀技
    // 霞斬り：突进斩
    '236A': mv('236A', '霞斬り', 'eijispecial1', 36, 'special', [
      hit('h1', {
        box: { x: 14, y: -68, w: 34, h: 22 },
        frames: [9, 13],
        damage: 56,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, travel: 72, travelFrames: 14 }),

    // 骨破ぎ：对空斩
    '623A': mv('623A', '骨破ぎ', 'eijispecial2', 38, 'special', [
      hit('h1', { box: { x: 6, y: -86, w: 28, h: 56 }, frames: [4, 9], damage: 28, hitStun: 16, hitstop: 6, meterGain: 5 }),
      hit('h2', {
        box: { x: 6, y: -92, w: 30, h: 64 },
        frames: [11, 17],
        damage: 38,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // 影すべり：低身滑铲（下段）
    '214A': mv('214A', '影すべり', 'eijispecial3', 34, 'special', [
      hit('h1', {
        box: { x: 10, y: -20, w: 32, h: 16 },
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
    ], { input: { motion: '214', buttons: ['A'] }, travel: 68, travelFrames: 14 }),

    // 空蝉：瞬移（无敌位移）
    '63214B': mv('63214B', '空蝉', 'roll', 28, 'special', [], {
      input: { motion: '63214', buttons: ['B'] },
      invuln: [{ frames: [1, 20], kind: 'full' }],
      travel: 100,
      travelFrames: 20,
      travelFollowInput: true,
    }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '斬鉄蟷螂', 'eijisuper', 66, 'super', [
      hit('h1', { box: { x: 12, y: -72, w: 36, h: 30 }, frames: [8, 11], damage: 30, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -74, w: 38, h: 34 }, frames: [15, 18], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 12, y: -76, w: 38, h: 36 }, frames: [22, 25], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h4', {
        box: { x: 10, y: -82, w: 42, h: 48 },
        frames: [40, 46],
        damage: 50,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50, travel: 60, travelFrames: 14 }),

    '236236AC': mv('236236AC', '斬鉄蟷螂 MAX', 'eijisuper', 78, 'super', [
      hit('h1', { box: { x: 12, y: -74, w: 38, h: 32 }, frames: [6, 9], damage: 28, hitStun: 16, hitstop: 5, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -76, w: 38, h: 34 }, frames: [13, 16], damage: 26, hitStun: 16, hitstop: 5, meterGain: 0 }),
      hit('h3', { box: { x: 12, y: -78, w: 40, h: 38 }, frames: [20, 23], damage: 26, hitStun: 16, hitstop: 5, meterGain: 0 }),
      hit('h4', { box: { x: 10, y: -80, w: 40, h: 42 }, frames: [27, 30], damage: 26, hitStun: 16, hitstop: 5, meterGain: 0 }),
      hit('h5', {
        box: { x: 8, y: -86, w: 44, h: 54 },
        frames: [48, 56],
        damage: 56,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100, travel: 70, travelFrames: 16 }),
  },
};

export default EIJI;
