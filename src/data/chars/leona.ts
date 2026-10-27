/**
 * 莉安娜·海德伦（KOF'97）：静電気 + 突进，イヤリング爆弾是慢速投掷道具。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214B', '623A', '214A', '236236A', '214214A'];

export const LEONA: CharDef = {
  id: 'leona',
  name: '莉安娜',
  palette: PALETTES['leona']!,
  hp: 980,
  walk: { fwd: 1.12, back: 0.95 },
  jump: { vy: 7.6, vx: 3.05, frames: 23 },
  boxes: standardBoxes(),
  push: { w: 33 },
  moves: {
    ...buildNormals({ power: 0.97, speed: 0.94, reach: 1.02, cancels: CANCELS, anim: { jump: 'leonajumpattack', crouchPunch: 'leonacrouchpunch', crouchKick: 'leonacrouchkick', heavyPunch: 'leonaheavypunch', heavyKick: 'leonaheavykick' } }),
    // 投技：← + C（不可防，只抓站立/蹲防的对手）
    '4C': mv('4C', '重力摔', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 105, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),


    // ---------------------------------------------------------------- 必杀技
    // ボルテックランチャー：长距气刃（近身判定很长）
    '236A': mv('236A', 'ボルテックランチャー', 'leonaspecial1', 40, 'special', [
      hit('h1', {
        box: { x: 18, y: -62, w: 54, h: 26 },
        frames: [12, 16],
        damage: 60,
        hitStun: 20,
        blockStun: 13,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    // ムーンスラッシャー：突进斜斩
    '214B': mv('214B', 'ムーンスラッシャー', 'leonaspecial2', 38, 'special', [
      hit('h1', {
        box: { x: 14, y: -70, w: 36, h: 34 },
        frames: [10, 14],
        damage: 58,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 58, travelFrames: 15 }),

    // グランドセイバー：无敌升龙斩
    '623A': mv('623A', 'グランドセイバー', 'leonaspecial3', 42, 'special', [
      hit('h1', {
        box: { x: 6, y: -90, w: 30, h: 64 },
        frames: [4, 11],
        damage: 72,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 6], kind: 'full' }] }),

    // イヤリング爆弾：慢速投掷道具
    '214A': mv('214A', 'イヤリング爆弾', 'special', 36, 'special', [], {
      input: { motion: '214', buttons: ['A'] },
      projectile: {
        anim: 'イヤリング爆弾',
        speed: 2.2,
        life: 110,
        spawnFrame: 10,
        spawnOffsetY: -56,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 22, h: 22 },
          frames: [1, 2],
          damage: 52,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', 'Vスラッシャー', 'leonasuper', 66, 'super', [
      hit('h1', { box: { x: 10, y: -76, w: 40, h: 34 }, frames: [8, 12], damage: 44, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -78, w: 42, h: 40 }, frames: [18, 22], damage: 40, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -80, w: 44, h: 50 }, frames: [28, 32], damage: 40, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h4', {
        box: { x: 8, y: -86, w: 46, h: 62 },
        frames: [44, 50],
        damage: 58,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 100, travel: 60, travelFrames: 12 }),

    '214214A': mv('214214A', 'リボルブブラスター', 'leonasuper', 60, 'super', [], {
      input: { motion: '214214', buttons: ['A'] },
      meterCost: 50,
      projectile: {
        anim: 'リボルブブラスター',
        speed: 4.6,
        life: 100,
        spawnFrame: 16,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 40, h: 34 },
          frames: [1, 2],
          damage: 98,
          hitStun: 24,
          blockStun: 15,
          hitstop: 12,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),
  },
};

export default LEONA;
