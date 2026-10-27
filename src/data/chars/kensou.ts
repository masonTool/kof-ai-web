/**
 * 椎拳崇（KOF'97）：超球弾 + 龍連牙，中距离压制型。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '623A', '214A', '236236A', '236236AC'];

export const KENSOU: CharDef = {
  id: 'kensou',
  name: '椎拳崇',
  palette: PALETTES['kensou']!,
  hp: 1000,
  walk: { fwd: 1.04, back: 0.9 },
  jump: { vy: 7.5, vx: 2.95, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    ...buildNormals({ power: 1.0, speed: 0.98, reach: 1.0, cancels: CANCELS }),

    // ---------------------------------------------------------------- 必杀技
    // 超球弾：气弹
    '236A': mv('236A', '超球弾', 'kensouspecial1', 36, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: '超球弾',
        speed: 3.4,
        life: 85,
        spawnFrame: 10,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 26, h: 24 },
          frames: [1, 2],
          damage: 54,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          meterGain: 0,
        }),
      },
    }),

    // 龍顎砕：对空升龙
    '623A': mv('623A', '龍顎砕', 'kensouspecial2', 40, 'special', [
      hit('h1', {
        box: { x: 6, y: -88, w: 28, h: 62 },
        frames: [4, 11],
        damage: 70,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // 龍連牙：三段连突
    '214A': mv('214A', '龍連牙', 'kensouspecial3', 44, 'special', [
      hit('h1', { box: { x: 12, y: -64, w: 30, h: 16 }, frames: [9, 12], damage: 32, hitStun: 15, hitstop: 6, meterGain: 5 }),
      hit('h2', { box: { x: 14, y: -62, w: 32, h: 16 }, frames: [16, 19], damage: 30, hitStun: 15, hitstop: 6, meterGain: 5 }),
      hit('h3', {
        box: { x: 14, y: -66, w: 34, h: 20 },
        frames: [26, 31],
        damage: 44,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, travel: 52, travelFrames: 20 }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '神龍撃', 'kensousuper', 60, 'super', [], {
      input: { motion: '236236', buttons: ['A'] },
      meterCost: 50,
      projectile: {
        anim: '神龍撃',
        speed: 4.4,
        life: 105,
        spawnFrame: 14,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 38, h: 32 },
          frames: [1, 2],
          damage: 100,
          hitStun: 24,
          blockStun: 15,
          hitstop: 12,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    '236236AC': mv('236236AC', '神龍天舞脚', 'kensousuper', 72, 'super', [
      hit('h1', { box: { x: 10, y: -78, w: 36, h: 44 }, frames: [8, 12], damage: 38, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -80, w: 38, h: 50 }, frames: [18, 22], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -82, w: 38, h: 52 }, frames: [28, 32], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h4', {
        box: { x: 8, y: -88, w: 40, h: 60 },
        frames: [42, 48],
        damage: 58,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100 }),
  },
};

export default KENSOU;
