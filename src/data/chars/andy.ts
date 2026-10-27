/**
 * 安迪·博加德（KOF'97）：斩影拳突进 + 飛翔拳飞行道具。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '41236A', '623A', '214A', '2363214A', '236236A'];

export const ANDY: CharDef = {
  id: 'andy',
  name: '安迪·博加德',
  palette: PALETTES['andy']!,
  hp: 990,
  walk: { fwd: 1.08, back: 0.9 },
  jump: { vy: 7.55, vx: 3.0, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    ...buildNormals({ power: 0.98, speed: 0.96, reach: 1.03, cancels: CANCELS, anim: { crouchPunch: 'andycrouchpunch', crouchKick: 'andycrouchkick', heavyPunch: 'andyheavypunch', heavyKick: 'andyheavykick' } }),

    // 指令技：肘落とし（中段）
    '6A': mv('6A', '肘落とし', 'punchHeavy', 28, 'command', [
      hit('h1', {
        box: { x: 12, y: -70, w: 30, h: 20 },
        frames: [9, 12],
        damage: 54,
        hitStun: 18,
        blockStun: 12,
        hitstop: 8,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['A'] } }),

    // ---------------------------------------------------------------- 必杀技
    // 飛翔拳：飞行道具（升龙弧线感用速度和高度近似）
    '236A': mv('236A', '飛翔拳', 'andyspecial1', 36, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: '飛翔拳',
        speed: 3.9,
        life: 80,
        spawnFrame: 10,
        spawnOffsetY: -46,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 26, h: 26 },
          frames: [1, 2],
          damage: 54,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          meterGain: 0,
        }),
      },
    }),

    // 斬影拳：带位移的连打
    '41236A': mv('41236A', '斬影拳', 'andyspecial2', 40, 'special', [
      hit('h1', { box: { x: 12, y: -62, w: 30, h: 16 }, frames: [8, 11], damage: 34, hitStun: 15, hitstop: 7, meterGain: 5 }),
      hit('h2', { box: { x: 14, y: -60, w: 32, h: 16 }, frames: [14, 17], damage: 32, hitStun: 16, hitstop: 7, meterGain: 5 }),
      hit('h3', {
        box: { x: 14, y: -64, w: 34, h: 18 },
        frames: [22, 26],
        damage: 40,
        hitStun: 20,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 5,
      }),
    ], { input: { motion: '41236', buttons: ['A'] }, travel: 78, travelFrames: 22, cancel: { onHit: ['214A'] } }),

    // 昇龍弾：对空升龙
    '623A': mv('623A', '昇龍弾', 'andyspecial3', 42, 'special', [
      hit('h1', {
        box: { x: 6, y: -90, w: 28, h: 64 },
        frames: [4, 11],
        damage: 70,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 6], kind: 'full' }] }),

    // 空破弾：短距能量弹（近身判定代替）
    '214A': mv('214A', '空破弾', 'special', 34, 'special', [
      hit('h1', {
        box: { x: 16, y: -60, w: 40, h: 24 },
        frames: [10, 14],
        damage: 58,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['A'] } }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '撃壁背水掌', 'andysuper', 56, 'super', [
      hit('h1', { box: { x: 10, y: -78, w: 40, h: 56 }, frames: [10, 14], damage: 50, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -78, w: 40, h: 56 }, frames: [22, 26], damage: 45, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h3', {
        box: { x: 10, y: -82, w: 44, h: 64 },
        frames: [34, 40],
        damage: 60,
        hitStun: 24,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '2363214A': mv('2363214A', '超裂破弾', 'andysuper', 74, 'super', [
      hit('h1', { box: { x: 12, y: -80, w: 44, h: 60 }, frames: [10, 14], damage: 45, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -80, w: 44, h: 60 }, frames: [20, 24], damage: 40, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h3', { box: { x: 12, y: -80, w: 44, h: 60 }, frames: [32, 36], damage: 40, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h4', { box: { x: 12, y: -80, w: 44, h: 60 }, frames: [44, 48], damage: 38, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h5', {
        box: { x: 12, y: -84, w: 48, h: 66 },
        frames: [58, 64],
        damage: 65,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '2363214', buttons: ['A'] }, meterCost: 100 }),
  },
};

export default ANDY;
