/**
 * 金家藩（KOF'97）：踢技为主，半月斬突进、飛燕斬中段、鳳凰脚是连踢超必杀。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236B', '214B', '623B', '236236B', '236236AC'];

export const KIM: CharDef = {
  id: 'kim',
  name: '金家藩',
  palette: PALETTES['kim']!,
  hp: 1000,
  walk: { fwd: 1.08, back: 0.9 },
  jump: { vy: 7.6, vx: 3.0, frames: 23 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    ...buildNormals({ power: 1.0, speed: 0.95, reach: 1.04, cancels: CANCELS, anim: { heavyPunch: 'kimheavypunch', heavyKick: 'kimheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // 半月斬：突进横踢
    '236B': mv('236B', '半月斬', 'kimspecial1', 38, 'special', [
      hit('h1', {
        box: { x: 14, y: -64, w: 36, h: 20 },
        frames: [10, 14],
        damage: 62,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['B'] }, travel: 66, travelFrames: 15 }),

    // 飛燕斬：跳起下劈（中段）
    '214B': mv('214B', '飛燕斬', 'kimspecial2', 40, 'special', [
      hit('h1', {
        box: { x: 10, y: -66, w: 32, h: 26 },
        frames: [13, 17],
        damage: 58,
        hitStun: 20,
        blockStun: 13,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] } }),

    // 空連脚：对空连踢
    '623B': mv('623B', '空連脚', 'kimspecial3', 42, 'special', [
      hit('h1', { box: { x: 6, y: -88, w: 28, h: 40 }, frames: [4, 8], damage: 30, hitStun: 16, hitstop: 6, meterGain: 5 }),
      hit('h2', { box: { x: 6, y: -92, w: 30, h: 50 }, frames: [10, 14], damage: 30, hitStun: 16, hitstop: 6, meterGain: 5 }),
      hit('h3', {
        box: { x: 6, y: -96, w: 32, h: 62 },
        frames: [18, 24],
        damage: 40,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '623', buttons: ['B'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236B': mv('236236B', '鳳凰脚', 'kimsuper', 66, 'super', [
      hit('h1', { box: { x: 10, y: -72, w: 34, h: 30 }, frames: [8, 12], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -74, w: 36, h: 34 }, frames: [16, 20], damage: 32, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -76, w: 36, h: 40 }, frames: [24, 28], damage: 32, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h4', { box: { x: 8, y: -80, w: 38, h: 46 }, frames: [32, 36], damage: 32, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h5', {
        box: { x: 6, y: -88, w: 40, h: 60 },
        frames: [48, 54],
        damage: 52,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['B'] }, meterCost: 50, travel: 50, travelFrames: 12 }),

    '236236AC': mv('236236AC', '鳳凰脚 MAX', 'kimsuper', 78, 'super', [
      hit('h1', { box: { x: 10, y: -72, w: 36, h: 32 }, frames: [6, 9], damage: 30, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -74, w: 36, h: 36 }, frames: [13, 16], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -76, w: 38, h: 40 }, frames: [20, 23], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h4', { box: { x: 8, y: -78, w: 38, h: 44 }, frames: [27, 30], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h5', { box: { x: 8, y: -82, w: 40, h: 50 }, frames: [34, 37], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h6', {
        box: { x: 6, y: -90, w: 42, h: 64 },
        frames: [54, 62],
        damage: 62,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['B', 'D'] }, meterCost: 100, travel: 60, travelFrames: 14 }),
  },
};

export default KIM;
