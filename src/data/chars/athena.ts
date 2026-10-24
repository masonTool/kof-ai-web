/**
 * 麻宫雅典娜（KOF'97）：サイコボール + 传送，体型小、跳得高。
 * 名字按 KOF 通行写法；不确定的招式名以"机制一致"为准（见 docs/ARCHITECTURE.md §1）。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals } from './template';

const CANCELS = ['236A', '623A', '214B', '63214B', '236236A', '236236AC'];

export const ATHENA: CharDef = {
  id: 'athena',
  name: '麻宫雅典娜',
  palette: PALETTES['athena']!,
  hp: 950,
  walk: { fwd: 1.14, back: 0.98 },
  jump: { vy: 7.9, vx: 3.05, frames: 23 },
  boxes: {
    stand: { x: -11, y: -74, w: 22, h: 74 },
    crouch: { x: -11, y: -48, w: 22, h: 48 },
    air: { x: -9, y: -68, w: 18, h: 68 },
  },
  push: { w: 32 },
  moves: {
    ...buildNormals({ power: 0.9, speed: 0.92, reach: 0.94, cancels: CANCELS }),

    // ---------------------------------------------------------------- 必杀技
    // サイコボール：气弹
    '236A': mv('236A', 'サイコボール', 'special', 34, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: 'サイコボール',
        speed: 3.5,
        life: 80,
        spawnFrame: 9,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 24, h: 22 },
          frames: [1, 2],
          damage: 50,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          meterGain: 0,
        }),
      },
    }),

    // サイコソード：短距精神刃
    '623A': mv('623A', 'サイコソード', 'special', 38, 'special', [
      hit('h1', {
        box: { x: 8, y: -84, w: 30, h: 60 },
        frames: [4, 10],
        damage: 62,
        hitStun: 21,
        blockStun: 13,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // フェニックスアロー：跳起下突（中段）
    '214B': mv('214B', 'フェニックスアロー', 'kickHeavy', 36, 'special', [
      hit('h1', {
        box: { x: 10, y: -64, w: 30, h: 24 },
        frames: [11, 15],
        damage: 54,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 50, travelFrames: 14 }),

    // サイキックテレポート：瞬移（无敌，位移大）
    '63214B': mv('63214B', 'サイキックテレポート', 'roll', 30, 'special', [], {
      input: { motion: '63214', buttons: ['B'] },
      invuln: [{ frames: [1, 22], kind: 'full' }],
      travel: 110,
      travelFrames: 22,
      travelFollowInput: true,
    }),

    // ---------------------------------------------------------------- 超必杀
    // シャイニングクリスタルビット：多段光弹（原作是同名 DM 的 MAX 版更痛）
    '236236A': mv('236236A', 'シャイニングクリスタルビット', 'special', 64, 'super', [
      hit('h1', { box: { x: 8, y: -80, w: 34, h: 50 }, frames: [10, 13], damage: 32, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -80, w: 34, h: 50 }, frames: [16, 19], damage: 30, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h3', { box: { x: 8, y: -82, w: 36, h: 54 }, frames: [22, 25], damage: 30, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h4', { box: { x: 8, y: -84, w: 38, h: 56 }, frames: [30, 33], damage: 30, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h5', {
        box: { x: 6, y: -90, w: 40, h: 64 },
        frames: [44, 50],
        damage: 52,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '236236AC': mv('236236AC', 'シャイニングクリスタルビット MAX', 'special', 76, 'super', [
      hit('h1', { box: { x: 8, y: -82, w: 36, h: 54 }, frames: [8, 11], damage: 30, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -82, w: 36, h: 54 }, frames: [14, 17], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 8, y: -84, w: 38, h: 56 }, frames: [20, 23], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h4', { box: { x: 8, y: -84, w: 38, h: 56 }, frames: [26, 29], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h5', { box: { x: 6, y: -88, w: 42, h: 60 }, frames: [32, 35], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h6', {
        box: { x: 6, y: -92, w: 44, h: 66 },
        frames: [52, 60],
        damage: 60,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100 }),
  },
};

export default ATHENA;
