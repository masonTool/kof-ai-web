/**
 * 坂崎亮（KOF'97）：極限流空手，虎煌拳是气弹，暫烈拳是贴身连打。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '236C', '214B', '623A', '236236A', '236236C'];

export const RYO: CharDef = {
  id: 'ryo',
  name: '坂崎亮',
  palette: PALETTES['ryo']!,
  hp: 1020,
  walk: { fwd: 0.98, back: 0.84 },
  jump: { vy: 7.35, vx: 2.85, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 35 },
  moves: {
    ...buildNormals({ power: 1.06, speed: 1.02, reach: 1.02, cancels: CANCELS, anim: { heavyPunch: 'ryoheavypunch', heavyKick: 'ryoheavykick' } }),
    // 投技：← + C（不可防，只抓站立/蹲防的对手）
    '4C': mv('4C', '背负投', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 105, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),


    // 指令技：上段落とし（中段拳）
    '6B': mv('6B', '上段落とし', 'punchHeavy', 30, 'command', [
      hit('h1', {
        box: { x: 14, y: -68, w: 30, h: 20 },
        frames: [10, 13],
        damage: 60,
        hitStun: 18,
        blockStun: 12,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['B'] } }),

    // ---------------------------------------------------------------- 必杀技
    // 虎煌拳：气弹
    '236A': mv('236A', '虎煌拳', 'ryospecial1', 38, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: '虎煌拳',
        speed: 3.3,
        life: 90,
        spawnFrame: 11,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 28, h: 24 },
          frames: [1, 2],
          damage: 58,
          hitStun: 19,
          blockStun: 12,
          hitstop: 9,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    // 暫烈拳：贴身连打（三段，原地）
    '236C': mv('236C', '暫烈拳', 'ryospecial2', 44, 'special', [
      hit('h1', { box: { x: 12, y: -64, w: 30, h: 16 }, frames: [9, 12], damage: 32, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h2', { box: { x: 12, y: -64, w: 30, h: 16 }, frames: [15, 18], damage: 30, hitStun: 14, hitstop: 6, meterGain: 5 }),
      hit('h3', {
        box: { x: 14, y: -66, w: 34, h: 20 },
        frames: [24, 29],
        damage: 46,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['C'] } }),

    // 飛燕疾風脚：空中回旋踢（中段）
    '214B': mv('214B', '飛燕疾風脚', 'ryospecial3', 40, 'special', [
      hit('h1', {
        box: { x: 12, y: -70, w: 34, h: 26 },
        frames: [12, 16],
        damage: 62,
        hitStun: 20,
        blockStun: 13,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 54, travelFrames: 16 }),

    // 極限流連舞拳：对空升龙拳
    '623A': mv('623A', '極限流連舞拳', 'punchHeavy', 42, 'special', [
      hit('h1', {
        box: { x: 6, y: -88, w: 28, h: 62 },
        frames: [4, 11],
        damage: 72,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '覇王翔吼拳', 'ryosuper', 62, 'super', [], {
      input: { motion: '236236', buttons: ['A'] },
      meterCost: 50,
      projectile: {
        anim: '覇王翔吼拳',
        speed: 4.2,
        life: 110,
        spawnFrame: 16,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 44, h: 40 },
          frames: [1, 2],
          damage: 110,
          hitStun: 24,
          blockStun: 15,
          hitstop: 13,
          knockdown: 'slam',
          meterGain: 0,
        }),
      },
    }),

    '236236C': mv('236236C', '天地覇煌拳', 'ryosuper', 74, 'super', [
      hit('h1', { box: { x: 10, y: -80, w: 42, h: 58 }, frames: [10, 14], damage: 45, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -80, w: 42, h: 58 }, frames: [20, 24], damage: 42, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -80, w: 42, h: 58 }, frames: [30, 34], damage: 42, hitStun: 20, hitstop: 9, meterGain: 0 }),
      hit('h4', {
        box: { x: 8, y: -86, w: 46, h: 64 },
        frames: [46, 52],
        damage: 66,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['C'] }, meterCost: 100 }),
  },
};

export default RYO;
