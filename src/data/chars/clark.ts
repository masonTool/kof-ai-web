/**
 * 克拉克·斯蒂尔（KOF'97）：投技专家，必杀大半是抓取，抓不到就是空振。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '63214A', '63214B', '623A', '236236A'];

export const CLARK: CharDef = {
  id: 'clark',
  name: '克拉克',
  palette: PALETTES['clark']!,
  hp: 1050,
  walk: { fwd: 0.94, back: 0.82 },
  jump: { vy: 7.35, vx: 2.75, frames: 25 },
  boxes: standardBoxes(),
  push: { w: 37 },
  moves: {
    ...buildNormals({ power: 1.05, speed: 1.03, reach: 0.98, cancels: CANCELS, anim: { crouchPunch: 'clarkcrouchpunch', crouchKick: 'clarkcrouchkick', heavyPunch: 'clarkheavypunch', heavyKick: 'clarkheavykick' } }),
    // 投技：← + C（不可防，只抓站立/蹲防的对手）
    '4C': mv('4C', '终极背摔', 'throwStart', 34, 'throw', [
      hit('h1', { box: { x: 4, y: -66, w: 24, h: 36 }, frames: [3, 7], damage: 120, hitStun: 30, blockStun: 0, hitstop: 14, pushback: 0, knockdown: 'slam' }),
    ], { input: { motion: '4', buttons: ['C'] } }),


    // ---------------------------------------------------------------- 必杀技
    // マウントタックル：贴身抓取（摔投）
    '236A': mv('236A', 'マウントタックル', 'clarkspecial1', 46, 'throw', [
      hit('h1', {
        box: { x: 4, y: -62, w: 32, h: 46 },
        frames: [6, 10],
        damage: 100,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '236', buttons: ['A'] }, blockable: false }),

    // フランケンシュタイナー：反摔
    '63214B': mv('63214B', 'フランケンシュタイナー', 'clarkspecial2', 52, 'throw', [
      hit('h1', {
        box: { x: 4, y: -64, w: 32, h: 48 },
        frames: [8, 12],
        damage: 112,
        hitStun: 30,
        blockStun: 0,
        hitstop: 13,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 6,
      }),
    ], { input: { motion: '63214', buttons: ['B'] }, blockable: false }),

    // スーパーアルゼンチンバックブリーカー：更大伤害的抓取
    '63214A': mv('63214A', 'スーパーアルゼンチン', 'clarksuper', 56, 'throw', [
      hit('h1', {
        box: { x: 4, y: -64, w: 32, h: 48 },
        frames: [10, 14],
        damage: 124,
        hitStun: 30,
        blockStun: 0,
        hitstop: 14,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 7,
      }),
    ], { input: { motion: '63214', buttons: ['A'] }, blockable: false }),

    // ローリングクレイドル：突进摔（这段是打判定，不是抓）
    '623A': mv('623A', 'ローリングクレイドル', 'clarkspecial3', 40, 'special', [
      hit('h1', {
        box: { x: 6, y: -86, w: 28, h: 58 },
        frames: [5, 11],
        damage: 68,
        hitStun: 22,
        blockStun: 13,
        hitstop: 10,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 4], kind: 'throw' }] }),

    // ---------------------------------------------------------------- 超必杀
    // アルティメットアルゼンチン：不可防的抓取超必杀
    '236236A': mv('236236A', 'アルティメットアルゼンチン', 'clarksuper', 72, 'super', [
      hit('h1', {
        box: { x: 4, y: -64, w: 34, h: 50 },
        frames: [8, 12],
        damage: 70,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        meterGain: 0,
      }),
      hit('h2', {
        box: { x: 4, y: -64, w: 34, h: 50 },
        frames: [24, 30],
        damage: 60,
        hitStun: 30,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        meterGain: 0,
      }),
      hit('h3', {
        box: { x: -24, y: -72, w: 76, h: 54 },
        frames: [44, 52],
        damage: 90,
        hitStun: 30,
        hitstop: 16,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 100, blockable: false }),
  },
};

export default CLARK;
