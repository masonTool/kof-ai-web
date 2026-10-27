/**
 * 大蛇（KOF'97 最終 BOSS）。
 *
 * 招式名按通行写法给出近似名（原作资料不全），机制是重点：
 * 判定范围极大（含**全屏**攻击）、不可防、血量最高、气槽自动回复。
 *
 * "全屏"没有引入新的引擎字段：直接用超宽判定盒（x 从 -400 起、宽 800）表达。
 * 少一个字段就少一处漏读——判定盒本来就是世界坐标，铺满舞台就是全屏。
 */
import type { CharDef } from '../schema';
import { hit, mv } from './helpers';
import { PALETTES } from './palette';
import { buildNormals, standardBoxes } from './template';

const CANCELS = ['236A', '214A', '623A', '236236A', '236236AC'];

/** 铺满整个舞台的判定盒（含空中） */
const FULLSCREEN_BOX = { x: -700, y: -220, w: 1400, h: 220 };

export const OROCHI: CharDef = {
  id: 'orochi',
  name: '大蛇',
  palette: PALETTES['orochi']!,
  hp: 1400,
  walk: { fwd: 0.9, back: 0.75 },
  jump: { vy: 7.2, vx: 2.6, frames: 26 },
  boxes: standardBoxes(),
  push: { w: 38 },
  boss: { damageTaken: 0.85, meterRegen: 0.5 },
  moves: {
    ...buildNormals({ power: 1.18, speed: 1.12, reach: 1.2, cancels: CANCELS, anim: { heavyPunch: 'orochiheavypunch', heavyKick: 'orochiheavykick' } }),

    // ---------------------------------------------------------------- 必杀技
    // 空間断ち：极长的横向判定（半屏）
    '236A': mv('236A', '空間断ち', 'orochispecial1', 46, 'special', [
      hit('h1', {
        box: { x: 10, y: -100, w: 200, h: 100 },
        frames: [14, 20],
        damage: 96,
        hitStun: 24,
        blockStun: 15,
        hitstop: 12,
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '236', buttons: ['A'] } }),

    // 大地の怒り：脚下扬起的冲击（不可防）
    '214A': mv('214A', '大地の怒り', 'orochispecial2', 50, 'special', [
      hit('h1', {
        box: { x: -60, y: -40, w: 240, h: 40 },
        frames: [16, 24],
        damage: 88,
        hitStun: 24,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '214', buttons: ['A'] }, blockable: false }),

    // 光の柱：对空（不可防）
    '623A': mv('623A', '光の柱', 'orochispecial3', 44, 'special', [
      hit('h1', {
        box: { x: -20, y: -200, w: 60, h: 200 },
        frames: [6, 14],
        damage: 92,
        hitStun: 24,
        blockStun: 0,
        hitstop: 12,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 8,
      }),
    ], { input: { motion: '623', buttons: ['A'] }, invuln: [{ frames: [1, 8], kind: 'full' }], blockable: false }),

    // ---------------------------------------------------------------- 超必杀
    // 全屏判定 + 不可防：BOSS 的"无解"感就靠这一招
    '236236A': mv('236236A', '大蛇の裁き', 'orochisuper', 76, 'super', [
      hit('h1', {
        box: { ...FULLSCREEN_BOX },
        frames: [20, 30],
        damage: 150,
        hitStun: 30,
        blockStun: 0,
        hitstop: 18,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A'] }, meterCost: 50, blockable: false }),

    '236236AC': mv('236236AC', '大蛇の裁き MAX', 'orochisuper', 90, 'super', [
      hit('h1', {
        box: { ...FULLSCREEN_BOX },
        frames: [16, 24],
        damage: 110,
        hitStun: 28,
        blockStun: 0,
        hitstop: 16,
        guard: 'unblockable',
        meterGain: 0,
      }),
      hit('h2', {
        box: { ...FULLSCREEN_BOX },
        frames: [34, 44],
        damage: 110,
        hitStun: 30,
        blockStun: 0,
        hitstop: 18,
        guard: 'unblockable',
        knockdown: 'slam',
        meterGain: 0,
      }),
    ], { input: { motion: '236236', buttons: ['A', 'C'] }, meterCost: 100, blockable: false }),
  },
};

export default OROCHI;
