/**
 * 镇元斋（KOF'97）：醉拳老爷子，个子矮、判定低，靠空突拳和位移吃饭。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals } from './template';

const CANCELS = ['236A', '214B', '623A', '236236A', '236236AC'];

export const CHIN: CharDef = {
  id: 'chin',
  name: '镇元斋',
  palette: PALETTES['chin']!,
  hp: 1000,
  walk: { fwd: 0.92, back: 0.8 },
  jump: { vy: 7.2, vx: 2.7, frames: 26 },
  // 矮个子：受击盒压得很低，很多高段技打不到
  boxes: {
    stand: { x: -12, y: -66, w: 24, h: 66 },
    crouch: { x: -12, y: -44, w: 24, h: 44 },
    air: { x: -10, y: -62, w: 20, h: 62 },
  },
  push: { w: 33 },
  moves: {
    ...buildNormals({ power: 1.02, speed: 1.04, reach: 0.96, cancels: CANCELS, anim: { punch: 'chinlightpunch', kick: 'chinlightkick', jump: 'chinjumpattack', crouchPunch: 'chincrouchpunch', crouchKick: 'chincrouchkick', heavyPunch: 'chinheavypunch', heavyKick: 'chinheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // 回転的空突拳：突进连打
    '236A': mv('236A', '回転的空突拳', 'chinspecial1', 46, 'special', [
      hit('h1', { box: { x: 12, y: -58, w: 30, h: 18 }, frames: [8, 11], damage: 30, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h2', { box: { x: 14, y: -58, w: 32, h: 18 }, frames: [15, 18], damage: 28, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h3', {
        box: { x: 14, y: -62, w: 34, h: 22 },
        frames: [25, 30],
        damage: 42,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, travel: 64, travelFrames: 24 }),

    // 柳燐蓬萊：矮身突进（下段）
    '214B': mv('214B', '柳燐蓬萊', 'chinspecial2', 38, 'special', [
      hit('h1', {
        box: { x: 10, y: -24, w: 34, h: 18 },
        frames: [10, 14],
        damage: 54,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 58, travelFrames: 15 }),

    // 酔歩：歪歪扭扭地滑过去（带无敌帧）
    '623A': mv('623A', '酔歩', 'chinspecial3', 32, 'special', [], {
      input: { motion: '623', buttons: ['A'] },
      invuln: [{ frames: [1, 18], kind: 'full' }],
      travel: 76,
      travelFrames: 18,
      travelFollowInput: true,
    }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '大酔直全方位', 'chinsuper', 64, 'super', [
      hit('h1', { box: { x: 8, y: -64, w: 36, h: 30 }, frames: [8, 12], damage: 36, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -64, w: 36, h: 30 }, frames: [18, 22], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h3', { box: { x: 6, y: -70, w: 38, h: 38 }, frames: [28, 32], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h4', {
        box: { x: 4, y: -76, w: 42, h: 46 },
        frames: [44, 50],
        damage: 54,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50, travel: 60, travelFrames: 16 }),

    '236236AC': mv('236236AC', '大酔直全方位 MAX', 'chinsuper', 74, 'super', [
      hit('h1', { box: { x: 6, y: -66, w: 38, h: 34 }, frames: [8, 11], damage: 32, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 6, y: -66, w: 38, h: 34 }, frames: [15, 18], damage: 30, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 6, y: -70, w: 40, h: 40 }, frames: [22, 25], damage: 30, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h4', { box: { x: 4, y: -74, w: 42, h: 44 }, frames: [30, 33], damage: 30, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h5', {
        box: { x: 2, y: -80, w: 46, h: 52 },
        frames: [50, 58],
        damage: 60,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100, travel: 70, travelFrames: 18 }),
  },
};

export default CHIN;
