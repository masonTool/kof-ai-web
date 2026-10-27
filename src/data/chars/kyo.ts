/**
 * 草薙京（KOF'97）招式表。
 *
 * 口径（见 docs/ARCHITECTURE.md §1）：**机制忠实、数值近似**。
 * 招式种类、指令、取消关系、判定等级按 KOF97 还原；帧数/伤害取公开资料的近似值。
 * 要校准手感就只改这个文件——引擎不认识"京"，只认帧数据。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';

/** 通常技命中后可以取消进的招式（KOF 的"必杀取消"） */
const SPECIAL_CANCELS = ['236A', '236C', '623P', '214K', '421K', '236236P', '236236AC'];

export const KYO: CharDef = {
  id: 'kyo',
  name: '草薙京',
  palette: PALETTES['kyo']!,
  hp: 1000,
  walk: { fwd: 1.05, back: 0.85 },
  jump: { vy: 7.6, vx: 2.9, frames: 24 },
  boxes: {
    stand: { x: -12, y: -78, w: 24, h: 78 },
    crouch: { x: -12, y: -50, w: 24, h: 50 },
    air: { x: -10, y: -72, w: 20, h: 72 },
  },
  push: { w: 34 },
  moves: {
    // ---------------------------------------------------------------- 通常技
    '5A': mv('5A', '轻拳', 'kyolightpunch', 13, 'normal', [
      hit('h1', { box: { x: 10, y: -64, w: 26, h: 10 }, frames: [3, 5], damage: 25, hitStun: 13, blockStun: 8, hitstop: 5 }),
    ], {
      cancel: { onHit: ['5B', '2B', '236A', '236C', '623P', '214K'] },
    }),

    '5B': mv('5B', '轻脚', 'kyolightkick', 17, 'normal', [
      hit('h1', { box: { x: 12, y: -44, w: 30, h: 12 }, frames: [5, 8], damage: 32, hitStun: 14, blockStun: 9, hitstop: 6 }),
    ], {
      cancel: { onHit: ['2B', '236A', '236C', '623P', '214K'] },
    }),

    '5C': mv('5C', '重拳', 'kyoheavypunch', 26, 'normal', [
      hit('h1', { box: { x: 14, y: -66, w: 32, h: 14 }, frames: [8, 11], damage: 70, hitStun: 18, blockStun: 12, hitstop: 9 }),
    ], { cancel: { onHit: SPECIAL_CANCELS } }),

    '5D': mv('5D', '重脚', 'kyoheavykick', 30, 'normal', [
      hit('h1', { box: { x: 12, y: -72, w: 34, h: 14 }, frames: [9, 12], damage: 78, hitStun: 18, blockStun: 12, hitstop: 9, level: 'high' }),
    ], { cancel: { onHit: SPECIAL_CANCELS } }),

    // 投技：← + C，只抓站立/蹲防的对手（空中、受击、无敌都抓不到，规则见 hit.ts）
    '4C': mv('4C', '一尺焙烙', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 110, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),

    '2A': mv('2A', '蹲轻拳', 'crouchPunch', 12, 'normal', [
      hit('h1', { box: { x: 10, y: -42, w: 24, h: 10 }, frames: [3, 5], damage: 22, hitStun: 12, blockStun: 7, hitstop: 4 }),
    ], { cancel: { onHit: ['2B', '236A', '236C'] } }),

    '2B': mv('2B', '蹲轻脚', 'crouchKick', 15, 'normal', [
      hit('h1', { box: { x: 8, y: -14, w: 30, h: 10 }, frames: [4, 7], damage: 26, hitStun: 13, blockStun: 8, hitstop: 5, guard: 'low', level: 'low' }),
    ], { cancel: { onHit: ['2B', '5B', '236A', '236C'] } }),

    '2C': mv('2C', '蹲重拳', 'crouchPunch', 24, 'normal', [
      hit('h1', { box: { x: 8, y: -68, w: 28, h: 22 }, frames: [7, 10], damage: 68, hitStun: 18, blockStun: 12, hitstop: 9 }),
    ], { cancel: { onHit: SPECIAL_CANCELS } }),

    '2D': mv('2D', '扫腿', 'crouchKick', 30, 'normal', [
      hit('h1', {
        box: { x: 8, y: -12, w: 36, h: 12 },
        frames: [8, 11],
        damage: 72,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
      }),
    ], { cancel: { onHit: ['236236P', '236236AC'] } }),

    // ---------------------------------------------------------------- 空中技
    'jA': mv('jA', '空中轻拳', 'jumpAttack', 20, 'normal', [
      hit('h1', { box: { x: 8, y: -52, w: 26, h: 12 }, frames: [4, 8], damage: 24, guard: 'overhead', level: 'overhead' }),
    ], { airborne: true, landingLag: 4 }),

    'jB': mv('jB', '空中轻脚', 'jumpAttack', 22, 'normal', [
      hit('h1', { box: { x: 10, y: -34, w: 28, h: 12 }, frames: [5, 9], damage: 30, guard: 'overhead', level: 'overhead' }),
    ], { airborne: true, landingLag: 4 }),

    'jC': mv('jC', '空中重拳', 'jumpAttack', 26, 'normal', [
      hit('h1', {
        box: { x: 10, y: -56, w: 30, h: 16 },
        frames: [6, 10],
        damage: 60,
        hitStun: 16,
        blockStun: 11,
        hitstop: 8,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { airborne: true, landingLag: 6 }),

    'jD': mv('jD', '空中重脚', 'jumpAttack', 28, 'normal', [
      hit('h1', {
        box: { x: 12, y: -40, w: 32, h: 16 },
        frames: [7, 11],
        damage: 65,
        hitStun: 16,
        blockStun: 11,
        hitstop: 8,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { airborne: true, landingLag: 6, cancel: { onHit: ['jC'] } }),

    // ---------------------------------------------------------------- 指令通常技
    '6B': mv('6B', '外式・轟斧 陽', 'kickLight', 30, 'command', [
      hit('h1', {
        box: { x: 14, y: -62, w: 30, h: 16 },
        frames: [10, 13],
        damage: 60,
        hitStun: 18,
        blockStun: 12,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['B'] }, cancel: { onHit: ['236A', '236C'] } }),

    '3D': mv('3D', '外式・奈落払い', 'crouchKick', 32, 'command', [
      hit('h1', {
        box: { x: 10, y: -10, w: 34, h: 12 },
        frames: [9, 12],
        damage: 65,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        guard: 'low',
        level: 'low',
        knockdown: 'trip',
      }),
    ], { input: { motion: '3', buttons: ['D'] } }),

    // ---------------------------------------------------------------- 吹飞
    'CD': mv('CD', '吹飞攻击', 'kickHeavy', 36, 'system', [
      hit('h1', {
        box: { x: 12, y: -58, w: 34, h: 20 },
        frames: [12, 15],
        damage: 90,
        hitStun: 22,
        blockStun: 14,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ]),

    // ---------------------------------------------------------------- 必杀技
    '236A': mv('236A', '百拾四式・荒咬み', 'kyspecial1', 34, 'special', [
      hit('h1', {
        box: { x: 22, y: -62, w: 36, h: 16 },
        frames: [10, 13],
        damage: 55,
        hitStun: 18,
        blockStun: 12,
        hitstop: 8,
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, cancel: { onHit: ['236A_2'] } }),

    '236A_2': mv('236A_2', '百弐拾八式・九傷', 'special', 30, 'special', [
      hit('h1', {
        box: { x: 20, y: -64, w: 34, h: 14 },
        frames: [8, 11],
        damage: 45,
        hitStun: 18,
        blockStun: 12,
        hitstop: 8,
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, cancel: { onHit: ['236A_3'] } }),

    '236A_3': mv('236A_3', '百弐拾七式・八錆', 'special', 36, 'special', [
      hit('h1', {
        box: { x: 20, y: -66, w: 38, h: 18 },
        frames: [10, 14],
        damage: 60,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    '236C': mv('236C', '百拾五式・毒咬み', 'kyspecial2', 36, 'special', [
      hit('h1', {
        box: { x: 24, y: -58, w: 38, h: 18 },
        frames: [11, 14],
        damage: 62,
        hitStun: 19,
        blockStun: 13,
        hitstop: 9,
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['C'] }, cancel: { onHit: ['236C_2'] } }),

    '236C_2': mv('236C_2', '四百壱式・罪詠み', 'special', 32, 'special', [
      hit('h1', {
        box: { x: 22, y: -62, w: 36, h: 16 },
        frames: [9, 12],
        damage: 50,
        hitStun: 19,
        blockStun: 13,
        hitstop: 9,
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['C'] }, cancel: { onHit: ['236C_3'] } }),

    '236C_3': mv('236C_3', '四百弐式・罰詠み', 'special', 40, 'special', [
      hit('h1', {
        box: { x: 20, y: -70, w: 40, h: 22 },
        frames: [12, 16],
        damage: 72,
        hitStun: 22,
        blockStun: 14,
        hitstop: 11,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['C'] } }),

    '623P': mv('623P', '百式・鬼焼き', 'kyspecial3', 42, 'special', [
      hit('h1', {
        box: { x: 6, y: -88, w: 26, h: 62 },
        frames: [4, 11],
        damage: 72,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 6], kind: 'full' }] }),

    '214K': mv('214K', '七拾五式・改', 'kickHeavy', 44, 'special', [
      hit('h1', {
        box: { x: 16, y: -56, w: 36, h: 16 },
        frames: [10, 14],
        damage: 45,
        hitStun: 16,
        blockStun: 11,
        hitstop: 8,
        meterGain: 6,
      }),
      hit('h2', {
        box: { x: 16, y: -56, w: 36, h: 16 },
        frames: [20, 24],
        damage: 45,
        hitStun: 22,
        blockStun: 12,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['D'] } }),

    '421K': mv('421K', '百弐拾壱式・轢鉄', 'kickHeavy', 36, 'special', [
      hit('h1', {
        box: { x: 14, y: -70, w: 32, h: 16 },
        frames: [12, 16],
        damage: 60,
        hitStun: 18,
        blockStun: 12,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
        meterGain: 7,
      }),
    ], { input: { motion: '421', buttons: ['B'] } }),

    // ---------------------------------------------------------------- 超必杀
    '236236P': mv('236236P', '裏百八式・大蛇薙', 'kysuper', 62, 'super', [
      hit('h1', {
        box: { x: 16, y: -88, w: 46, h: 80 },
        frames: [12, 16],
        damage: 60,
        hitStun: 20,
        blockStun: 13,
        hitstop: 10,
        meterGain: 0,
      }),
      hit('h2', {
        box: { x: 16, y: -88, w: 46, h: 80 },
        frames: [26, 30],
        damage: 45,
        hitStun: 20,
        blockStun: 13,
        hitstop: 10,
        meterGain: 0,
      }),
      hit('h3', {
        box: { x: 16, y: -88, w: 46, h: 80 },
        frames: [36, 40],
        damage: 40,
        hitStun: 24,
        blockStun: 14,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '236236AC': mv('236236AC', '最終決戦奥義・無式', 'kysuper', 74, 'super', [
      hit('h1', { box: { x: 14, y: -80, w: 44, h: 60 }, frames: [10, 14], damage: 50, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h2', { box: { x: 14, y: -80, w: 44, h: 60 }, frames: [20, 24], damage: 45, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h3', { box: { x: 14, y: -80, w: 44, h: 60 }, frames: [30, 34], damage: 45, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h4', { box: { x: 14, y: -80, w: 44, h: 60 }, frames: [40, 44], damage: 40, hitStun: 20, hitstop: 10, meterGain: 0 }),
      hit('h5', {
        box: { x: 14, y: -80, w: 44, h: 60 },
        frames: [52, 56],
        damage: 60,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100 }),

    // ---------------------------------------------------------------- 系统技
    // AB 紧急回避：按住前 = 前转，按住后/不按 = 后转（方向由 travelFollowInput 决定）
    'AB': mv('AB', '紧急回避', 'roll', 26, 'system', [], {
      invuln: [{ frames: [1, 20], kind: 'full' }],
      travel: 88,
      travelFrames: 20,
      travelFollowInput: true,
    }),

    // ---------------------------------------------------------------- 投技
    // 近身判定（要求贴身才能成立）在系统机制条目里补，这里先给数据
    'throw': mv('throw', '釟鉄', 'throwStart', 44, 'throw', [
      hit('h1', {
        box: { x: 4, y: -60, w: 28, h: 40 },
        frames: [3, 5],
        damage: 110,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        level: 'mid',
        knockdown: 'slam',
        meterGain: 5,
      }),
    ], { input: { motion: '6', buttons: ['C'] }, blockable: false }),
  },
};

export default KYO;
