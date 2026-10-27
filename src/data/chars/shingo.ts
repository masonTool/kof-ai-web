/**
 * 矢吹真吾（KOF'97）：京的徒弟，招式是"未完成版"——
 * 机制照抄京（荒咬/毒咬/鬼焼），但判定更短、伤害更低、启动更慢。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '623A', '214B', '236236A', '236236AC'];

export const SHINGO: CharDef = {
  id: 'shingo',
  name: '矢吹真吾',
  palette: PALETTES['shingo']!,
  hp: 990,
  walk: { fwd: 1.02, back: 0.88 },
  jump: { vy: 7.45, vx: 2.85, frames: 24 },
  boxes: standardBoxes(),
  push: { w: 34 },
  moves: {
    // 徒弟版：力量低、速度慢、距离短
    ...buildNormals({ power: 0.9, speed: 1.06, reach: 0.92, cancels: CANCELS, anim: { heavyPunch: 'shingoheavypunch', heavyKick: 'shingoheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // 荒咬み（未完成）：判定比京短一截
    '236A': mv('236A', '荒咬み（未完成）', 'shingospecial1', 36, 'special', [
      hit('h1', {
        box: { x: 16, y: -62, w: 28, h: 14 },
        frames: [12, 15],
        damage: 44,
        hitStun: 17,
        blockStun: 11,
        hitstop: 8,
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, cancel: { onHit: ['236A_2'] } }),

    '236A_2': mv('236A_2', '荒咬み・二段（未完成）', 'punchHeavy', 32, 'special', [
      hit('h1', {
        box: { x: 14, y: -64, w: 28, h: 14 },
        frames: [10, 13],
        damage: 36,
        hitStun: 18,
        blockStun: 11,
        hitstop: 8,
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    // 真吾キック：徒弟自己琢磨的踢
    '214B': mv('214B', '真吾キック', 'shingospecial2', 38, 'special', [
      hit('h1', {
        box: { x: 12, y: -62, w: 30, h: 18 },
        frames: [11, 15],
        damage: 52,
        hitStun: 19,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'trip',
        meterGain: 7,
      }),
    ], { input: { motion: '214', buttons: ['B'] }, travel: 50, travelFrames: 15 }),

    // 鬼焼き（未完成）：无敌帧也只有京的一半
    '623A': mv('623A', '鬼焼き（未完成）', 'shingospecial3', 40, 'special', [
      hit('h1', {
        box: { x: 6, y: -84, w: 24, h: 56 },
        frames: [6, 12],
        damage: 58,
        hitStun: 21,
        blockStun: 12,
        hitstop: 9,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 3], kind: 'full' }] }),

    // ---------------------------------------------------------------- 超必杀
    '236236A': mv('236236A', '外式・駈け鳳麟', 'shingosuper', 60, 'super', [
      hit('h1', { box: { x: 12, y: -72, w: 34, h: 28 }, frames: [10, 14], damage: 30, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h2', { box: { x: 12, y: -74, w: 34, h: 32 }, frames: [18, 22], damage: 28, hitStun: 16, hitstop: 7, meterGain: 0 }),
      hit('h3', {
        box: { x: 10, y: -80, w: 38, h: 44 },
        frames: [34, 40],
        damage: 46,
        hitStun: 26,
        hitstop: 13,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50, travel: 54, travelFrames: 12 }),

    '236236AC': mv('236236AC', '外式・駈け鳳麟 MAX', 'shingosuper', 72, 'super', [
      hit('h1', { box: { x: 10, y: -74, w: 36, h: 30 }, frames: [8, 11], damage: 28, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h2', { box: { x: 10, y: -76, w: 36, h: 34 }, frames: [15, 18], damage: 26, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h3', { box: { x: 10, y: -78, w: 38, h: 38 }, frames: [22, 25], damage: 26, hitStun: 16, hitstop: 6, meterGain: 0 }),
      hit('h4', {
        box: { x: 8, y: -84, w: 42, h: 50 },
        frames: [44, 50],
        damage: 56,
        hitStun: 28,
        hitstop: 15,
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100, travel: 64, travelFrames: 14 }),
  },
};

export default SHINGO;
