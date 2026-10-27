/**
 * 坂崎百合（KOF'97）：又小又快，虎煌拳是小气弹，空牙能对空。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals } from './template';

const CANCELS = ['236A', '623A', '214B', '236236A', '236236C'];

export const YURI: CharDef = {
  id: 'yuri',
  name: '坂崎百合',
  palette: PALETTES['yuri']!,
  hp: 960, // 血薄
  walk: { fwd: 1.18, back: 1.0 },
  jump: { vy: 7.8, vx: 3.1, frames: 22 },
  boxes: {
    stand: { x: -11, y: -74, w: 22, h: 74 },
    crouch: { x: -11, y: -48, w: 22, h: 48 },
    air: { x: -9, y: -68, w: 18, h: 68 },
  },
  push: { w: 32 },
  moves: {
    ...buildNormals({ power: 0.92, speed: 0.9, reach: 0.95, cancels: CANCELS, anim: { jump: 'yurijumpattack', crouchPunch: 'yuricrouchpunch', crouchKick: 'yuricrouchkick', heavyPunch: 'yuriheavypunch', heavyKick: 'yuriheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // 虎煌拳：小型气弹
    '236A': mv('236A', '虎煌拳', 'yurispecial1', 34, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: '虎煌拳',
        speed: 3.5,
        life: 75,
        spawnFrame: 9,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 24, h: 20 },
          frames: [1, 2],
          damage: 48,
          hitStun: 17,
          blockStun: 11,
          hitstop: 8,
          meterGain: 0,
        }),
      },
    }),

    // 空牙：对空升龙（无敌帧短一点，毕竟不是格斗型）
    '623A': mv('623A', '空牙', 'special', 38, 'special', [
      hit('h1', {
        box: { x: 6, y: -86, w: 26, h: 58 },
        frames: [4, 10],
        damage: 64,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 4], kind: 'full' }] }),

    // 百合脚：回旋踢（中段）
    '214B': mv('214B', '百合脚', 'yurispecial3', 36, 'special', [
      hit('h1', {
        box: { x: 10, y: -66, w: 32, h: 22 },
        frames: [11, 15],
        damage: 56,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 46, travelFrames: 14 }),

    // 百烈拳：小连打
    '236C': mv('236C', '百烈拳', 'yurispecial2', 38, 'special', [
      hit('h1', { box: { x: 10, y: -62, w: 28, h: 14 }, frames: [7, 9], damage: 22, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h2', { box: { x: 10, y: -62, w: 28, h: 14 }, frames: [12, 14], damage: 20, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h3', {
        box: { x: 12, y: -64, w: 30, h: 16 },
        frames: [20, 24],
        damage: 36,
        hitStun: 20,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['C'] } }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '覇王翔吼拳', 'yurisuper', 58, 'super', [], {
      input: { motion: '236236', buttons: ['A'] },
      meterCost: 50,
      projectile: {
        anim: '覇王翔吼拳',
        speed: 4.0,
        life: 100,
        spawnFrame: 14,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 38, h: 34 },
          frames: [1, 2],
          damage: 96,
          hitStun: 24,
          blockStun: 14,
          hitstop: 12,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    '236236C': mv('236236C', '覇王天翔翼', 'yurisuper', 70, 'super', [
      hit('h1', { box: { x: 8, y: -80, w: 34, h: 56 }, frames: [8, 12], damage: 42, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -80, w: 34, h: 56 }, frames: [18, 22], damage: 38, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h3', { box: { x: 8, y: -84, w: 36, h: 60 }, frames: [28, 32], damage: 38, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h4', {
        box: { x: 6, y: -88, w: 38, h: 64 },
        frames: [44, 50],
        damage: 58,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['C'] }, meterCost: 100 }),
  },
};

export default YURI;
