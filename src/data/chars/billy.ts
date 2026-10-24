/**
 * 比利·凯恩（KOF'97）：三节棍，判定比谁都长，但收招也慢。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '623A', '214A', '236236A', '236236AC'];

export const BILLY: CharDef = {
  id: 'billy',
  name: '比利·凯恩',
  palette: PALETTES['billy']!,
  hp: 1010,
  walk: { fwd: 0.96, back: 0.84 },
  jump: { vy: 7.4, vx: 2.8, frames: 25 },
  boxes: standardBoxes(),
  push: { w: 35 },
  moves: {
    // 三节棍：攻击距离加成 20%，但速度慢 8%
    ...buildNormals({ power: 1.04, speed: 1.08, reach: 1.2, cancels: CANCELS }),

    // ---------------------------------------------------------------- 必杀技
    // 旋風棍：抡棍连打
    '236A': mv('236A', '旋風棍', 'punchHeavy', 48, 'special', [
      hit('h1', { box: { x: 16, y: -70, w: 44, h: 22 }, frames: [10, 13], damage: 30, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h2', { box: { x: 16, y: -70, w: 44, h: 22 }, frames: [17, 20], damage: 28, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h3', {
        box: { x: 16, y: -74, w: 48, h: 28 },
        frames: [26, 32],
        damage: 46,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    // 三節棍中段打ち：对空长判定
    '623A': mv('623A', '三節棍中段打ち', 'punchHeavy', 42, 'special', [
      hit('h1', {
        box: { x: 8, y: -92, w: 34, h: 66 },
        frames: [5, 12],
        damage: 68,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // 火龍棍：火焰突刺（飞行道具）
    '214A': mv('214A', '火龍棍', 'special', 40, 'special', [], {
      input: { motion: '214', buttons: ['A'] },
      projectile: {
        anim: '火龍棍',
        speed: 3.0,
        life: 85,
        spawnFrame: 12,
        spawnOffsetY: -44,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 34, h: 28 },
          frames: [1, 2],
          damage: 60,
          hitStun: 19,
          blockStun: 13,
          hitstop: 9,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '超火炎旋風棍', 'special', 68, 'super', [
      hit('h1', { box: { x: 14, y: -76, w: 46, h: 30 }, frames: [10, 14], damage: 34, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 14, y: -78, w: 48, h: 34 }, frames: [18, 22], damage: 32, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h3', { box: { x: 14, y: -80, w: 50, h: 40 }, frames: [26, 30], damage: 32, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h4', {
        box: { x: 12, y: -86, w: 54, h: 52 },
        frames: [44, 52],
        damage: 54,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '236236AC': mv('236236AC', '超火炎旋風棍 MAX', 'special', 80, 'super', [
      hit('h1', { box: { x: 12, y: -78, w: 48, h: 32 }, frames: [8, 11], damage: 30, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -80, w: 50, h: 36 }, frames: [15, 18], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 12, y: -82, w: 52, h: 40 }, frames: [22, 25], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h4', { box: { x: 10, y: -84, w: 54, h: 46 }, frames: [29, 32], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h5', {
        box: { x: 8, y: -90, w: 58, h: 58 },
        frames: [50, 58],
        damage: 62,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100 }),
  },
};

export default BILLY;
