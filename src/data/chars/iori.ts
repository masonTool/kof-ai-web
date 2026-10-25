/**
 * 八神庵（KOF'97）。
 *
 * 口径同京：机制（指令/取消/判定等级/无敌帧）按原作，帧数与伤害取近似值。
 * 已知偏差：`闇払い` 原作是飞行道具，引擎还没有投射物系统，这里做成近距离能量斩，
 * 等投射物条目落地后换回 projectile 数据即可（判定框已经留得比通常技长）。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';

/** 通常技命中后可接的必杀 */
const CANCELS = ['236A', '623A', '214A', '63214A', '2363214A', '236236A'];

export const IORI: CharDef = {
  id: 'iori',
  name: '八神庵',
  palette: PALETTES['iori']!,
  hp: 1000,
  walk: { fwd: 1.0, back: 0.88 },
  jump: { vy: 7.5, vx: 2.85, frames: 24 },
  boxes: {
    stand: { x: -12, y: -78, w: 24, h: 78 },
    crouch: { x: -12, y: -50, w: 24, h: 50 },
    air: { x: -10, y: -72, w: 20, h: 72 },
  },
  push: { w: 34 },
  moves: {
    // ---------------------------------------------------------------- 通常技
    '5A': mv('5A', '轻拳', 'punchLight', 13, 'normal', [
      hit('h1', { box: { x: 10, y: -64, w: 26, h: 10 }, frames: [3, 5], damage: 24 }),
    ], { cancel: { onHit: ['5B', '2B', ...CANCELS] } }),

    '5B': mv('5B', '轻脚', 'kickLight', 17, 'normal', [
      hit('h1', { box: { x: 12, y: -46, w: 30, h: 12 }, frames: [5, 8], damage: 30, hitStun: 14, hitstop: 6 }),
    ], { cancel: { onHit: ['2B', ...CANCELS] } }),

    '5C': mv('5C', '重拳', 'punchHeavy', 26, 'normal', [
      hit('h1', { box: { x: 14, y: -66, w: 32, h: 14 }, frames: [8, 11], damage: 72, hitStun: 18, blockStun: 12, hitstop: 9 }),
    ], { cancel: { onHit: CANCELS } }),

    '5D': mv('5D', '重脚', 'kickHeavy', 30, 'normal', [
      hit('h1', { box: { x: 12, y: -72, w: 34, h: 14 }, frames: [9, 12], damage: 78, hitStun: 18, blockStun: 12, hitstop: 9, level: 'high' }),
    ], { cancel: { onHit: CANCELS } }),

    // 投技：← + C（不可防，只抓站立/蹲防的对手）
    '4C': mv('4C', '屑風', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 105, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),

    '2A': mv('2A', '蹲轻拳', 'crouchPunch', 12, 'normal', [
      hit('h1', { box: { x: 10, y: -42, w: 24, h: 10 }, frames: [3, 5], damage: 22, hitStun: 12, blockStun: 7, hitstop: 4 }),
    ], { cancel: { onHit: ['2B', '236A', '214A'] } }),

    '2B': mv('2B', '蹲轻脚', 'crouchKick', 15, 'normal', [
      hit('h1', { box: { x: 8, y: -14, w: 30, h: 10 }, frames: [4, 7], damage: 26, guard: 'low', level: 'low' }),
    ], { cancel: { onHit: ['2B', '5B', ...CANCELS] } }),

    '2C': mv('2C', '蹲重拳', 'crouchPunch', 24, 'normal', [
      hit('h1', { box: { x: 8, y: -68, w: 28, h: 22 }, frames: [7, 10], damage: 68, hitStun: 18, blockStun: 12, hitstop: 9 }),
    ], { cancel: { onHit: CANCELS } }),

    '2D': mv('2D', '扫腿', 'crouchKick', 30, 'normal', [
      hit('h1', {
        box: { x: 8, y: -12, w: 36, h: 12 },
        frames: [8, 11],
        damage: 70,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
      }),
    ], { cancel: { onHit: ['2363214A', '236236A'] } }),

    // ---------------------------------------------------------------- 空中技
    'jA': mv('jA', '空中轻拳', 'jumpAttack', 20, 'normal', [
      hit('h1', { box: { x: 8, y: -52, w: 26, h: 12 }, frames: [4, 8], damage: 24, guard: 'overhead', level: 'overhead' }),
    ], { airborne: true, landingLag: 4 }),

    // 百合折り：往下打，能翻到背后（判定盒压得低）
    'jB': mv('jB', '外式・百合折り', 'jumpAttack', 22, 'normal', [
      hit('h1', {
        box: { x: 6, y: -30, w: 30, h: 20 },
        frames: [5, 9],
        damage: 34,
        guard: 'overhead',
        level: 'overhead',
        hitStun: 15,
      }),
    ], { airborne: true, landingLag: 4 }),

    'jC': mv('jC', '空中重拳', 'jumpAttack', 26, 'normal', [
      hit('h1', { box: { x: 10, y: -56, w: 30, h: 16 }, frames: [6, 10], damage: 62, guard: 'overhead', level: 'overhead', hitStun: 16, hitstop: 8 }),
    ], { airborne: true, landingLag: 6 }),

    'jD': mv('jD', '空中重脚', 'jumpAttack', 28, 'normal', [
      hit('h1', { box: { x: 12, y: -40, w: 32, h: 16 }, frames: [7, 11], damage: 66, guard: 'overhead', level: 'overhead', hitStun: 16, hitstop: 8 }),
    ], { airborne: true, landingLag: 6 }),

    // ---------------------------------------------------------------- 指令技
    '6B': mv('6B', '外式・夢弾', 'kickLight', 34, 'command', [
      hit('h1', { box: { x: 14, y: -62, w: 30, h: 16 }, frames: [9, 11], damage: 32, hitstop: 6 }),
      hit('h2', { box: { x: 16, y: -60, w: 32, h: 18 }, frames: [16, 19], damage: 38, hitStun: 18, blockStun: 12, hitstop: 8 }),
    ], { input: { motion: '6', buttons: ['B'] }, cancel: { onHit: ['236A', '214A'] } }),

    // ---------------------------------------------------------------- 吹飞
    'CD': mv('CD', '吹飞攻击', 'kickHeavy', 36, 'system', [
      hit('h1', {
        box: { x: 12, y: -58, w: 34, h: 20 },
        frames: [12, 15],
        damage: 88,
        hitStun: 22,
        blockStun: 14,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ]),

    // ---------------------------------------------------------------- 回避
    'AB': mv('AB', '紧急回避', 'roll', 26, 'system', [], {
      invuln: [{ frames: [1, 20], kind: 'full' }],
      travel: 88,
      travelFrames: 20,
      travelFollowInput: true,
    }),

    // ---------------------------------------------------------------- 必杀技
    '236A': mv('236A', '百八式・闇払い', 'special', 40, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: '闇払い',
        speed: 3.4,
        life: 90,
        spawnFrame: 12,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 26, h: 24 },
          frames: [1, 2],
          damage: 62,
          hitStun: 20,
          blockStun: 13,
          hitstop: 9,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    '623A': mv('623A', '百式・鬼焼き', 'special', 42, 'special', [
      hit('h1', {
        box: { x: 6, y: -88, w: 26, h: 62 },
        frames: [4, 11],
        damage: 74,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 6], kind: 'full' }] }),

    '214A': mv('214A', '百弐拾七式・葵花', 'special', 34, 'special', [
      hit('h1', {
        box: { x: 18, y: -70, w: 34, h: 24 },
        frames: [10, 13],
        damage: 52,
        hitStun: 18,
        blockStun: 12,
        hitstop: 8,
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, cancel: { onHit: ['214A_2'] } }),

    '214A_2': mv('214A_2', '葵花・二段', 'special', 30, 'special', [
      hit('h1', {
        box: { x: 18, y: -68, w: 34, h: 24 },
        frames: [8, 11],
        damage: 46,
        hitStun: 18,
        blockStun: 12,
        hitstop: 8,
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, cancel: { onHit: ['214A_3'] } }),

    '214A_3': mv('214A_3', '葵花・三段', 'special', 40, 'special', [
      hit('h1', {
        box: { x: 16, y: -76, w: 38, h: 30 },
        frames: [12, 16],
        damage: 68,
        hitStun: 22,
        blockStun: 14,
        hitstop: 11,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['A'] } }),

    '63214A': mv('63214A', '屑風', 'throwStart', 46, 'throw', [
      hit('h1', {
        box: { x: 4, y: -60, w: 30, h: 44 },
        frames: [5, 8],
        damage: 100,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '63214', buttons: ['A'] }, blockable: false }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '裏百八式・八酒杯', 'special', 56, 'super', [
      hit('h1', { box: { x: 14, y: -80, w: 44, h: 60 }, frames: [12, 16], damage: 60, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h2', {
        box: { x: 14, y: -80, w: 44, h: 60 },
        frames: [26, 32],
        damage: 70,
        hitStun: 24,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '2363214A': mv('2363214A', '禁千弐百拾壱式・八稚女', 'special', 78, 'super', [
      hit('h1', { box: { x: 12, y: -76, w: 42, h: 56 }, frames: [10, 14], damage: 46, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -76, w: 42, h: 56 }, frames: [20, 24], damage: 40, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h3', { box: { x: 12, y: -76, w: 42, h: 56 }, frames: [30, 34], damage: 40, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h4', { box: { x: 12, y: -76, w: 42, h: 56 }, frames: [42, 46], damage: 36, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h5', {
        box: { x: 12, y: -76, w: 42, h: 56 },
        frames: [56, 60],
        damage: 62,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '2363214', buttons: ['A'] }, meterCost: 100 }),
  },
};

export default IORI;
