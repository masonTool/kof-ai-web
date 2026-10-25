/**
 * 拉尔夫·琼斯（KOF'97）：拳击系，バルカンパンチ是贴身连打，超必杀是那一拳。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214A', '214B', '623A', '236236A', '2363214A'];

export const RALF: CharDef = {
  id: 'ralf',
  name: '拉尔夫',
  palette: PALETTES['ralf']!,
  hp: 1040,
  walk: { fwd: 1.0, back: 0.86 },
  jump: { vy: 7.4, vx: 2.85, frames: 25 },
  boxes: standardBoxes(),
  push: { w: 36 },
  moves: {
    ...buildNormals({ power: 1.08, speed: 1.02, reach: 1.04, cancels: CANCELS }),
    // 投技：← + C（不可防，只抓站立/蹲防的对手）
    '4C': mv('4C', '阿根廷背摔', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 120, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),


    // ---------------------------------------------------------------- 必杀技
    // バルカンパンチ：原地连打五段
    '236A': mv('236A', 'バルカンパンチ', 'punchLight', 48, 'special', [
      hit('h1', { box: { x: 10, y: -64, w: 28, h: 14 }, frames: [7, 9], damage: 22, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h2', { box: { x: 10, y: -64, w: 28, h: 14 }, frames: [12, 14], damage: 20, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h3', { box: { x: 10, y: -64, w: 28, h: 14 }, frames: [17, 19], damage: 20, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h4', { box: { x: 10, y: -64, w: 28, h: 14 }, frames: [22, 24], damage: 20, hitStun: 12, hitstop: 5, meterGain: 4 }),
      hit('h5', {
        box: { x: 12, y: -66, w: 32, h: 18 },
        frames: [30, 35],
        damage: 42,
        hitStun: 22,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    // ラリアット：突进球
    '214A': mv('214A', 'ラリアット', 'punchHeavy', 38, 'special', [
      hit('h1', {
        box: { x: 14, y: -64, w: 34, h: 20 },
        frames: [10, 14],
        damage: 64,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, travel: 64, travelFrames: 15 }),

    // ダイビングパンチ：跳起下砸（中段）
    '214B': mv('214B', 'ダイビングパンチ', 'punchHeavy', 40, 'special', [
      hit('h1', {
        box: { x: 12, y: -62, w: 32, h: 24 },
        frames: [13, 17],
        damage: 58,
        hitStun: 20,
        blockStun: 13,
        hitstop: 9,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] } }),

    // グランドインパクト：对空上勾拳
    '623A': mv('623A', 'グランドインパクト', 'punchHeavy', 40, 'special', [
      hit('h1', {
        box: { x: 6, y: -88, w: 28, h: 60 },
        frames: [4, 10],
        damage: 70,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', 'バリバリバルカンパンチ', 'special', 64, 'super', [
      hit('h1', { box: { x: 10, y: -66, w: 30, h: 16 }, frames: [8, 10], damage: 30, hitStun: 14, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -66, w: 30, h: 16 }, frames: [14, 16], damage: 28, hitStun: 14, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -68, w: 32, h: 18 }, frames: [20, 22], damage: 28, hitStun: 14, hitstop: 6, meterGain: 0 }),
      hit('h4', {
        box: { x: 10, y: -72, w: 34, h: 24 },
        frames: [30, 36],
        damage: 48,
        hitStun: 24,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50 }),

    '2363214A': mv('2363214A', 'ギャラクティカファントム', 'special', 72, 'super', [
      hit('h1', {
        box: { x: 10, y: -66, w: 34, h: 22 },
        frames: [12, 16],
        damage: 80,
        hitStun: 24,
        hitstop: 12,
        meterGain: 0,
      }),
      hit('h2', {
        box: { x: 8, y: -84, w: 44, h: 60 },
        frames: [30, 36],
        damage: 110,
        hitStun: 26,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '2363214', buttons: ['A'] }, meterCost: 100, travel: 70, travelFrames: 14 }),
  },
};

export default RALF;
