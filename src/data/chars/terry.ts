/**
 * 特瑞·博加德（KOF'97）：波动 + 突进型。
 * 通常技走模板，必杀技手写。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214A', '623A', '214B', '236236A', '236236B'];

export const TERRY: CharDef = {
  id: 'terry',
  name: '特瑞·博加德',
  palette: PALETTES['terry']!,
  hp: 1000,
  walk: { fwd: 1.05, back: 0.88 },
  jump: { vy: 7.5, vx: 2.95, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    ...buildNormals({ power: 1.02, reach: 1.06, cancels: CANCELS, anim: { crouchPunch: 'terrycrouchpunch', crouchKick: 'terrycrouchkick', heavyPunch: 'terryheavypunch', heavyKick: 'terryheavykick' } }),
    // 投技：← + C（不可防，只抓站立/蹲防的对手）
    '4C': mv('4C', '强力灌篮', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 105, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),


    // 指令技：スラッシュキック（中段）
    '6B': mv('6B', 'スラッシュキック', 'kickLight', 30, 'command', [
      hit('h1', {
        box: { x: 14, y: -60, w: 32, h: 18 },
        frames: [10, 13],
        damage: 58,
        hitStun: 18,
        blockStun: 12,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['B'] } }),

    // ---------------------------------------------------------------- 必杀技
    // パワーウェイブ：地面波，飞行道具
    '236A': mv('236A', 'パワーウェイブ', 'terryspecial1', 38, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: 'パワーウェイブ',
        speed: 3.2,
        life: 95,
        spawnFrame: 12,
        spawnOffsetY: -18,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 30, h: 20 },
          frames: [1, 2],
          damage: 56,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          knockdown: 'trip',
          meterGain: 0,
        }),
      },
    }),

    // バーンナックル：带位移的突进拳
    '214A': mv('214A', 'バーンナックル', 'terryspecial2', 38, 'special', [
      hit('h1', {
        box: { x: 14, y: -62, w: 34, h: 18 },
        frames: [9, 13],
        damage: 62,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, travel: 62, travelFrames: 16 }),

    // ライジングタックル：升龙，有无敌帧
    '623A': mv('623A', 'ライジングタックル', 'terryspecial3', 44, 'special', [
      hit('h1', {
        box: { x: 6, y: -92, w: 30, h: 66 },
        frames: [5, 12],
        damage: 72,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // クラックシュート：跳起下砸（中段）
    '214B': mv('214B', 'クラックシュート', 'kickHeavy', 40, 'special', [
      hit('h1', {
        box: { x: 12, y: -58, w: 32, h: 22 },
        frames: [14, 18],
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

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', 'パワーゲイザー', 'terrysuper', 62, 'super', [
      hit('h1', { box: { x: 12, y: -84, w: 46, h: 62 }, frames: [12, 16], damage: 55, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -84, w: 46, h: 62 }, frames: [24, 28], damage: 45, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h3', {
        box: { x: 12, y: -84, w: 46, h: 62 },
        frames: [36, 42],
        damage: 50,
        hitStun: 24,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '236236B': mv('236236B', 'バスターウルフ', 'terrysuper', 58, 'super', [
      hit('h1', {
        box: { x: 14, y: -68, w: 40, h: 34 },
        frames: [10, 14],
        damage: 70,
        hitStun: 22,
        hitstop: 11,
        meterGain: 0,
      }),
      hit('h2', {
        box: { x: 10, y: -86, w: 44, h: 70 },
        frames: [24, 30],
        damage: 90,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['B'] }, meterCost: 100, travel: 90, travelFrames: 14 }),
  },
};

export default TERRY;
