/**
 * 东丈（KOF'97）：多段连打 + 旋风腿，压起身强。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '236B', '63214B', '214B', '236236B', '214214B'];

export const JOE: CharDef = {
  id: 'joe',
  name: '东丈',
  palette: PALETTES['joe']!,
  hp: 1010,
  walk: { fwd: 1.02, back: 0.86 },
  jump: { vy: 7.45, vx: 2.9, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    ...buildNormals({ power: 1.04, speed: 0.98, reach: 1.02, cancels: CANCELS }),

    // 指令技：膝蹴り（中段）
    '6B': mv('6B', '膝蹴り', 'kickLight', 28, 'command', [
      hit('h1', {
        box: { x: 12, y: -62, w: 28, h: 18 },
        frames: [9, 12],
        damage: 56,
        hitStun: 18,
        blockStun: 12,
        hitstop: 8,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['B'] } }),

    // ---------------------------------------------------------------- 必杀技
    // 爆裂拳：原地连打（四段）
    '236A': mv('236A', '爆裂拳', 'joespecial1', 46, 'special', [
      hit('h1', { box: { x: 10, y: -64, w: 28, h: 14 }, frames: [8, 10], damage: 24, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h2', { box: { x: 10, y: -64, w: 28, h: 14 }, frames: [13, 15], damage: 22, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h3', { box: { x: 10, y: -64, w: 28, h: 14 }, frames: [18, 20], damage: 22, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h4', {
        box: { x: 12, y: -66, w: 32, h: 18 },
        frames: [26, 30],
        damage: 40,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    // 虎破脚：突进踢
    '236B': mv('236B', '虎破脚', 'joespecial2', 40, 'special', [
      hit('h1', {
        box: { x: 14, y: -62, w: 36, h: 20 },
        frames: [10, 14],
        damage: 64,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['B'] }, travel: 68, travelFrames: 16 }),

    // 竜巻旋風脚：多段旋风腿，带位移
    '63214B': mv('63214B', '竜巻旋風脚', 'joespecial3', 52, 'special', [
      hit('h1', { box: { x: 8, y: -76, w: 34, h: 44 }, frames: [8, 11], damage: 30, hitStun: 13, hitstop: 6, meterGain: 4 }),
      hit('h2', { box: { x: 8, y: -76, w: 34, h: 44 }, frames: [14, 17], damage: 28, hitStun: 13, hitstop: 6, meterGain: 4 }),
      hit('h3', { box: { x: 8, y: -76, w: 34, h: 44 }, frames: [20, 23], damage: 28, hitStun: 13, hitstop: 6, meterGain: 4 }),
      hit('h4', {
        box: { x: 8, y: -78, w: 36, h: 46 },
        frames: [28, 33],
        damage: 42,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '63214', buttons: ['B'] }, travel: 70, travelFrames: 26 }),

    // 黄金のカカト落とし：中段下砸
    '214B': mv('214B', '黄金のカカト落とし', 'kickHeavy', 38, 'special', [
      hit('h1', {
        box: { x: 12, y: -66, w: 32, h: 24 },
        frames: [13, 17],
        damage: 60,
        hitStun: 20,
        blockStun: 13,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] } }),

    // ---------------------------------------------------------------- 超必杀
    '236236B': mv('236236B', 'スクリューアッパー', 'joesuper', 58, 'super', [
      hit('h1', { box: { x: 8, y: -88, w: 34, h: 70 }, frames: [8, 12], damage: 45, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -88, w: 34, h: 70 }, frames: [18, 22], damage: 40, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h3', {
        box: { x: 8, y: -92, w: 36, h: 76 },
        frames: [30, 36],
        damage: 55,
        hitStun: 24,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['B'] }, meterCost: 50 }),

    '214214B': mv('214214B', '爆裂ハリケーン', 'joesuper', 72, 'super', [
      hit('h1', { box: { x: 6, y: -84, w: 40, h: 60 }, frames: [10, 13], damage: 40, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h2', { box: { x: 6, y: -84, w: 40, h: 60 }, frames: [18, 21], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h3', { box: { x: 6, y: -84, w: 40, h: 60 }, frames: [26, 29], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h4', { box: { x: 6, y: -84, w: 40, h: 60 }, frames: [34, 37], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h5', {
        box: { x: 4, y: -88, w: 44, h: 64 },
        frames: [48, 54],
        damage: 60,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '214214', buttons: ['B'] }, meterCost: 100 }),
  },
};

export default JOE;
