/**
 * 七枷社（KOF'97）：大地之力，胳膊长、突进猛。
 * 招式名按 KOF 通行写法，帧数与伤害取近似值。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214A', '623A', '236236A', '236236AC'];

export const YASHIRO: CharDef = {
  id: 'yashiro',
  name: '七枷社',
  palette: PALETTES['yashiro']!,
  hp: 1050,
  walk: { fwd: 1.0, back: 0.86 },
  jump: { vy: 7.4, vx: 2.9, frames: 25 },
  boxes: standardBoxes(),
  push: { w: 36 },
  moves: {
    ...buildNormals({ power: 1.08, speed: 1.02, reach: 1.08, cancels: CANCELS, anim: { heavyPunch: 'yashiroheavypunch', heavyKick: 'yashiroheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // 強靭ダン：突进肩撞
    '236A': mv('236A', '強靭ダン', 'yashirospecial1', 38, 'special', [
      hit('h1', {
        box: { x: 14, y: -64, w: 36, h: 24 },
        frames: [10, 14],
        damage: 66,
        hitStun: 20,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, travel: 66, travelFrames: 15 }),

    // ミサイルマイト：跳起砸地（中段）
    '214A': mv('214A', 'ミサイルマイト', 'yashirospecial2', 42, 'special', [
      hit('h1', {
        box: { x: 10, y: -70, w: 38, h: 34 },
        frames: [14, 18],
        damage: 64,
        hitStun: 21,
        blockStun: 13,
        hitstop: 10,
        guard: 'overhead',
        level: 'overhead',
        knockdown: 'trip',
        meterGain: 8,
      }),
    ], { input: { motion: '214', buttons: ['A'] } }),

    // ジェットカウンター：对空上捞
    '623A': mv('623A', 'ジェットカウンター', 'yashirospecial3', 40, 'special', [
      hit('h1', {
        box: { x: 6, y: -90, w: 30, h: 62 },
        frames: [5, 11],
        damage: 70,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 5], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', 'ミリオンスタンプ', 'yashirosuper', 66, 'super', [
      hit('h1', { box: { x: 10, y: -72, w: 40, h: 34 }, frames: [10, 14], damage: 38, hitStun: 17, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -74, w: 40, h: 38 }, frames: [20, 24], damage: 36, hitStun: 17, hitstop: 7, meterGain: 0 }),
      hit('h3', {
        box: { x: 8, y: -80, w: 44, h: 48 },
        frames: [40, 46],
        damage: 56,
        hitStun: 26,
        hitstop: 14,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50, travel: 46, travelFrames: 14 }),

    '236236AC': mv('236236AC', 'ミリオンスタンプ MAX', 'yashirosuper', 78, 'super', [
      hit('h1', { box: { x: 8, y: -74, w: 42, h: 36 }, frames: [8, 11], damage: 34, hitStun: 17, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 8, y: -76, w: 42, h: 40 }, frames: [16, 19], damage: 32, hitStun: 17, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 8, y: -78, w: 44, h: 42 }, frames: [24, 27], damage: 32, hitStun: 17, hitstop: 6, meterGain: 0 }),
      hit('h4', {
        box: { x: 6, y: -84, w: 48, h: 52 },
        frames: [48, 56],
        damage: 64,
        hitStun: 28,
        hitstop: 16,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100, travel: 56, travelFrames: 16 }),
  },
};

export default YASHIRO;
