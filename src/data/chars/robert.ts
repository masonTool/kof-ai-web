/**
 * 罗伯特·加西亚（KOF'97）：腿法快、龍撃拳是气弹、龍虎乱舞是连打超必杀。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214B', '623B', '214A', '236236B', '2363214B'];

export const ROBERT: CharDef = {
  id: 'robert',
  name: '罗伯特·加西亚',
  palette: PALETTES['robert']!,
  hp: 990,
  walk: { fwd: 1.1, back: 0.92 },
  jump: { vy: 7.5, vx: 3.0, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    ...buildNormals({ power: 0.99, speed: 0.95, reach: 1.05, cancels: CANCELS }),
    // 投技：← + C（不可防，只抓站立/蹲防的对手）
    '4C': mv('4C', '龙虎投', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 105, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),


    // 指令技：幻影脚（中段）
    '6B': mv('6B', '幻影脚', 'kickLight', 28, 'command', [
      hit('h1', {
        box: { x: 14, y: -64, w: 30, h: 18 },
        frames: [9, 12],
        damage: 56,
        hitStun: 18,
        blockStun: 12,
        hitstop: 8,
        guard: 'overhead',
        level: 'overhead',
      }),
    ], { input: { motion: '6', buttons: ['B'] } }),

    // ---------------------------------------------------------------- 必杀技
    // 龍撃拳：气弹
    '236A': mv('236A', '龍撃拳', 'robspecial1', 36, 'special', [], {
      input: { motion: '236', buttons: ['A'] },
      projectile: {
        anim: '龍撃拳',
        speed: 3.6,
        life: 85,
        spawnFrame: 10,
        spawnOffsetY: -40,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 26, h: 22 },
          frames: [1, 2],
          damage: 54,
          hitStun: 18,
          blockStun: 12,
          hitstop: 8,
          meterGain: 0,
        }),
      },
    }),

    // 飛燕疾風脚：突进回旋踢
    '214B': mv('214B', '飛燕疾風脚', 'kickHeavy', 38, 'special', [
      hit('h1', {
        box: { x: 12, y: -68, w: 34, h: 24 },
        frames: [10, 14],
        damage: 60,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 62, travelFrames: 15 }),

    // 幻影脚・連：二段回旋（可取消接龍撃拳）
    '214A': mv('214A', '幻影脚・連', 'robspecial2', 34, 'special', [
      hit('h1', { box: { x: 12, y: -60, w: 32, h: 18 }, frames: [8, 11], damage: 34, hitStun: 15, hitstop: 7, meterGain: 5 }),
      hit('h2', {
        box: { x: 12, y: -66, w: 34, h: 20 },
        frames: [16, 20],
        damage: 44,
        hitStun: 20,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, cancel: { onHit: ['236A'] } }),

    // 昇龍脚：对空
    '623B': mv('623B', '昇龍脚', 'robspecial3', 40, 'special', [
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
    ], { input: { motion: '623', buttons: ['B'] }, invuln: [{ frames: [1, 6], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236B': mv('236236B', '龍虎乱舞', 'robsuper', 70, 'super', [
      hit('h1', { box: { x: 12, y: -70, w: 38, h: 30 }, frames: [8, 12], damage: 40, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -70, w: 38, h: 30 }, frames: [16, 20], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h3', { box: { x: 12, y: -76, w: 40, h: 40 }, frames: [24, 28], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h4', { box: { x: 12, y: -76, w: 40, h: 40 }, frames: [32, 36], damage: 36, hitStun: 18, hitstop: 8, meterGain: 0 }),
      hit('h5', {
        box: { x: 8, y: -86, w: 44, h: 62 },
        frames: [46, 52],
        damage: 62,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['B'] }, meterCost: 100, travel: 70, travelFrames: 12 }),

    '2363214B': mv('2363214B', '覇王翔吼拳', 'robsuper', 58, 'super', [], {
      input: { motion: '2363214', buttons: ['B'] },
      meterCost: 50,
      projectile: {
        anim: '覇王翔吼拳',
        speed: 4.0,
        life: 100,
        spawnFrame: 14,
        hit: hit('p1', {
          box: { x: 0, y: 0, w: 40, h: 36 },
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
  },
};

export default ROBERT;
