/**
 * ゲーニッツ（KOF'97 中 BOSS）。
 *
 * 招式名按通行写法给出近似名（原作名称资料不全），以**机制**为准：
 * 大判定突进 + 慢速大気弾 + 对空必杀，外加 BOSS 属性（减伤 + 自动回气）。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214A', '623A', '236236A', '236236AC'];

export const GOENITZ: CharDef = {
  id: 'goenitz',
  name: 'ゲーニッツ',
  palette: PALETTES['goenitz']!,
  hp: 1200,
  walk: { fwd: 0.95, back: 0.8 },
  jump: { vy: 7.3, vx: 2.7, frames: 26 },
  boxes: standardBoxes(),
  push: { w: 36 },
  // BOSS：挨打没那么痛、气槽自己会涨
  boss: { damageTaken: 0.8, meterRegen: 0.35 },
  moves: {
    // 大判定、慢收招
    ...buildNormals({ power: 1.12, speed: 1.1, reach: 1.16, cancels: CANCELS, anim: { crouchPunch: 'goenitzcrouchpunch', crouchKick: 'goenitzcrouchkick', heavyPunch: 'goenitzheavypunch', heavyKick: 'goenitzheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // ミズチ：长判定风刃突进
    '236A': mv('236A', 'ミズチ', 'goenitzspecial1', 42, 'special', [
      hit('h1', {
        box: { x: 14, y: -76, w: 52, h: 40 },
        frames: [11, 16],
        damage: 78,
        hitStun: 21,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, travel: 70, travelFrames: 16 }),

    // ヨルムンガンド：慢速大気弾
    '214A': mv('214A', 'ヨルムンガンド', 'goenitzspecial2', 44, 'special', [], {
      input: { motion: '214', buttons: ['A'] },
      projectile: {
        anim: 'ヨルムンガンド',
        speed: 2.4,
        life: 120,
        spawnFrame: 13,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 40, h: 40 },
          frames: [1, 2],
          damage: 82,
          hitStun: 22,
          blockStun: 14,
          hitstop: 11,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    // 对空：上升气刃
    '623A': mv('623A', 'ゲーニッツ・ライジング', 'goenitzspecial3', 44, 'special', [
      hit('h1', {
        box: { x: 6, y: -96, w: 34, h: 72 },
        frames: [5, 13],
        damage: 86,
        hitStun: 23,
        blockStun: 14,
        hitstop: 11,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 7], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '大気の奔流', 'goenitzsuper', 70, 'super', [
      hit('h1', { box: { x: 8, y: -92, w: 48, h: 46 }, frames: [10, 14], damage: 46, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -96, w: 52, h: 56 }, frames: [20, 24], damage: 42, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h3', {
        box: { x: 4, y: -104, w: 60, h: 74 },
        frames: [42, 50],
        damage: 76,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '236236AC': mv('236236AC', '大気の奔流 MAX', 'goenitzsuper', 84, 'super', [
      hit('h1', { box: { x: 6, y: -94, w: 52, h: 50 }, frames: [8, 11], damage: 40, hitStun: 18, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 6, y: -98, w: 56, h: 58 }, frames: [16, 19], damage: 38, hitStun: 18, hitstop: 7, meterGain: 0 }),
      hit('h3', { box: { x: 4, y: -102, w: 60, h: 66 }, frames: [24, 27], damage: 38, hitStun: 18, hitstop: 7, meterGain: 0 }),
      hit('h4', {
        box: { x: 0, y: -110, w: 70, h: 84 },
        frames: [50, 60],
        damage: 88,
        hitStun: 30,
        hitstop: 18,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100 }),
  },
};

export default GOENITZ;
