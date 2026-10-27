/**
 * 角色模板：把"几乎每个角色都有"的那一套（12 个通常技 + 吹飞 + 回避）参数化。
 *
 * 为什么值得抽：36 个角色如果每人手写一遍，同样的判定盒/帧数会写出 36 份微妙的差异，
 * 改一条手感规则要改 36 处。模板只暴露"力量/速度/距离/取消表"四个旋钮，
 * 角色之间的差异靠这四个数 + 各自的必杀技表达。
 *
 * 注意：这是**新角色**的模板；最早的四个人（京/庵/红丸/大门）是手写并逐帧调过的，
 * 不强行迁移（迁移只会让已校准的手感重新漂移）。
 */
import type { Box, CharDef, MoveDef } from '../schema';
import { hit, mv } from './helpers';

export interface NormalStyle {
  /** 伤害倍率（默认 1） */
  power?: number;
  /** 速度倍率：< 1 更快（帧数乘它，默认 1） */
  speed?: number;
  /** 攻击距离倍率（判定盒宽度乘它，默认 1） */
  reach?: number;
  /** 通常技命中后可取消进的招式（各自的必杀 id） */
  cancels?: readonly string[];
  /** 姿势风格：踢技为主 or 拳技为主（只影响 anim 名字） */
  /**
   * 姿势风格：只影响 anim 名字。
   *
   * `heavyPunch`/`heavyKick` 用来给**重攻击**指定角色专属的出手姿势
   * （`buildNormals` 原本把重攻击硬编码成 `punchHeavy`/`kickHeavy`，
   * 导致所有角色的 5C/5D 长得一样）。
   */
  anim?: {
    punch?: string;
    kick?: string;
    crouchPunch?: string;
    crouchKick?: string;
    jump?: string;
    heavyPunch?: string;
    heavyKick?: string;
  };
}

const DEFAULT_ANIM = {
  punch: 'punchLight',
  kick: 'kickLight',
  crouchPunch: 'crouchPunch',
  crouchKick: 'crouchKick',
  jump: 'jumpAttack',
};
const HEAVY_ANIM = { punch: 'punchHeavy', kick: 'kickHeavy' };

function tune(base: { damage: number; total: number; box: Box; hitStun: number; blockStun: number }, s: Required<Pick<NormalStyle, 'power' | 'speed' | 'reach'>>) {
  return {
    damage: Math.max(1, Math.round(base.damage * s.power)),
    total: Math.max(6, Math.round(base.total * s.speed)),
    hitStun: Math.max(6, Math.round(base.hitStun * s.speed)),
    blockStun: Math.max(3, Math.round(base.blockStun * s.speed)),
    box: { ...base.box, x: base.box.x, w: Math.round(base.box.w * s.reach) },
  };
}

/** 生成 12 个通常技 + CD + AB */
export function buildNormals(style: NormalStyle = {}): Record<string, MoveDef> {
  const s = {
    power: style.power ?? 1,
    speed: style.speed ?? 1,
    reach: style.reach ?? 1,
  };
  const anim = { ...DEFAULT_ANIM, ...style.anim };
  // 重攻击的姿势名：默认 punchHeavy/kickHeavy，可由 style.anim.heavyPunch/heavyKick 覆盖
  const heavy = {
    punch: style.anim?.heavyPunch ?? HEAVY_ANIM.punch,
    kick: style.anim?.heavyKick ?? HEAVY_ANIM.kick,
  };
  const cancels = style.cancels ?? [];

  const light = (key: string, name: string, base: { damage: number; total: number; box: Box; hitStun: number; blockStun: number }, extra: Partial<MoveDef> = {}): MoveDef =>
    mv(key, name, anim.punch, tune(base, s).total, 'normal', [
      hit('h1', {
        box: tune(base, s).box,
        frames: [Math.max(2, Math.round(3 * s.speed)), Math.max(3, Math.round(5 * s.speed))],
        damage: tune(base, s).damage,
        hitStun: tune(base, s).hitStun,
        blockStun: tune(base, s).blockStun,
        hitstop: 5,
      }),
    ], extra);

  const moves: Record<string, MoveDef> = {};

  // ---- 站姿
  moves['5A'] = light('5A', '轻拳', { damage: 24, total: 13, box: { x: 10, y: -64, w: 26, h: 10 }, hitStun: 13, blockStun: 8 }, {
    cancel: { onHit: ['5B', '2B', ...cancels] },
  });
  moves['5B'] = mv('5B', '轻脚', anim.kick, tune({ damage: 30, total: 17, box: { x: 12, y: -46, w: 30, h: 12 }, hitStun: 14, blockStun: 9 }, s).total, 'normal', [
    hit('h1', {
      box: tune({ damage: 30, total: 17, box: { x: 12, y: -46, w: 30, h: 12 }, hitStun: 14, blockStun: 9 }, s).box,
      frames: [Math.round(5 * s.speed), Math.round(8 * s.speed)],
      damage: Math.round(30 * s.power),
      hitStun: 14,
      blockStun: 9,
      hitstop: 6,
    }),
  ], { cancel: { onHit: ['2B', ...cancels] } });

  moves['5C'] = mv('5C', '重拳', heavy.punch, tune({ damage: 70, total: 26, box: { x: 14, y: -66, w: 32, h: 14 }, hitStun: 18, blockStun: 12 }, s).total, 'normal', [
    hit('h1', {
      box: tune({ damage: 70, total: 26, box: { x: 14, y: -66, w: 32, h: 14 }, hitStun: 18, blockStun: 12 }, s).box,
      frames: [Math.round(8 * s.speed), Math.round(11 * s.speed)],
      damage: Math.round(70 * s.power),
      hitStun: 18,
      blockStun: 12,
      hitstop: 9,
    }),
  ], { cancel: { onHit: [...cancels] } });

  moves['5D'] = mv('5D', '重脚', heavy.kick, tune({ damage: 76, total: 30, box: { x: 12, y: -72, w: 34, h: 14 }, hitStun: 18, blockStun: 12 }, s).total, 'normal', [
    hit('h1', {
      box: tune({ damage: 76, total: 30, box: { x: 12, y: -72, w: 34, h: 14 }, hitStun: 18, blockStun: 12 }, s).box,
      frames: [Math.round(9 * s.speed), Math.round(12 * s.speed)],
      damage: Math.round(76 * s.power),
      hitStun: 18,
      blockStun: 12,
      hitstop: 9,
      level: 'high',
    }),
  ], { cancel: { onHit: [...cancels] } });

  // ---- 蹲姿
  moves['2A'] = mv('2A', '蹲轻拳', anim.crouchPunch, tune({ damage: 22, total: 12, box: { x: 10, y: -42, w: 24, h: 10 }, hitStun: 12, blockStun: 7 }, s).total, 'normal', [
    hit('h1', {
      box: tune({ damage: 22, total: 12, box: { x: 10, y: -42, w: 24, h: 10 }, hitStun: 12, blockStun: 7 }, s).box,
      frames: [Math.round(3 * s.speed), Math.round(5 * s.speed)],
      damage: Math.round(22 * s.power),
      hitStun: 12,
      blockStun: 7,
      hitstop: 4,
    }),
  ], { cancel: { onHit: ['2B', ...cancels.slice(0, 2)] } });

  moves['2B'] = mv('2B', '蹲轻脚', anim.crouchKick, tune({ damage: 26, total: 15, box: { x: 8, y: -14, w: 30, h: 10 }, hitStun: 13, blockStun: 8 }, s).total, 'normal', [
    hit('h1', {
      box: tune({ damage: 26, total: 15, box: { x: 8, y: -14, w: 30, h: 10 }, hitStun: 13, blockStun: 8 }, s).box,
      frames: [Math.round(4 * s.speed), Math.round(7 * s.speed)],
      damage: Math.round(26 * s.power),
      hitStun: 13,
      blockStun: 8,
      hitstop: 5,
      guard: 'low',
      level: 'low',
    }),
  ], { cancel: { onHit: ['2B', ...cancels.slice(0, 2)] } });

  moves['2C'] = mv('2C', '蹲重拳', anim.crouchPunch, tune({ damage: 68, total: 24, box: { x: 8, y: -68, w: 28, h: 22 }, hitStun: 18, blockStun: 12 }, s).total, 'normal', [
    hit('h1', {
      box: tune({ damage: 68, total: 24, box: { x: 8, y: -68, w: 28, h: 22 }, hitStun: 18, blockStun: 12 }, s).box,
      frames: [Math.round(7 * s.speed), Math.round(10 * s.speed)],
      damage: Math.round(68 * s.power),
      hitStun: 18,
      blockStun: 12,
      hitstop: 9,
    }),
  ], { cancel: { onHit: [...cancels] } });

  moves['2D'] = mv('2D', '扫腿', anim.crouchKick, tune({ damage: 70, total: 30, box: { x: 8, y: -12, w: 36, h: 12 }, hitStun: 20, blockStun: 12 }, s).total, 'normal', [
    hit('h1', {
      box: tune({ damage: 70, total: 30, box: { x: 8, y: -12, w: 36, h: 12 }, hitStun: 20, blockStun: 12 }, s).box,
      frames: [Math.round(8 * s.speed), Math.round(11 * s.speed)],
      damage: Math.round(70 * s.power),
      hitStun: 20,
      blockStun: 12,
      hitstop: 9,
      guard: 'low',
      level: 'low',
      knockdown: 'trip',
    }),
  ]);

  // ---- 空中
  moves['jA'] = mv('jA', '空中轻拳', anim.jump, 20, 'normal', [
    hit('h1', { box: { x: 8, y: -52, w: 26, h: 12 }, frames: [4, 8], damage: Math.round(24 * s.power), guard: 'overhead', level: 'overhead' }),
  ], { airborne: true, landingLag: 4 });
  moves['jB'] = mv('jB', '空中轻脚', anim.jump, 22, 'normal', [
    hit('h1', { box: { x: 10, y: -36, w: 28, h: 12 }, frames: [5, 9], damage: Math.round(30 * s.power), guard: 'overhead', level: 'overhead' }),
  ], { airborne: true, landingLag: 4 });
  moves['jC'] = mv('jC', '空中重拳', anim.jump, 26, 'normal', [
    hit('h1', {
      box: { x: 10, y: -56, w: 30, h: 16 },
      frames: [6, 10],
      damage: Math.round(60 * s.power),
      hitStun: 16,
      hitstop: 8,
      guard: 'overhead',
      level: 'overhead',
    }),
  ], { airborne: true, landingLag: 6 });
  moves['jD'] = mv('jD', '空中重脚', anim.jump, 28, 'normal', [
    hit('h1', {
      box: { x: 12, y: -40, w: 32, h: 16 },
      frames: [7, 11],
      damage: Math.round(64 * s.power),
      hitStun: 16,
      hitstop: 8,
      guard: 'overhead',
      level: 'overhead',
    }),
  ], { airborne: true, landingLag: 6 });

  // ---- 系统技
  moves['CD'] = mv('CD', '吹飞攻击', HEAVY_ANIM.kick, 36, 'system', [
    hit('h1', {
      box: { x: 12, y: -58, w: 34, h: 20 },
      frames: [12, 15],
      damage: Math.round(90 * s.power),
      hitStun: 22,
      blockStun: 14,
      hitstop: 12,
      knockdown: 'slam',
      meterGain: 8,
    }),
  ]);

  moves['AB'] = mv('AB', '紧急回避', 'roll', 26, 'system', [], {
    invuln: [{ frames: [1, 20], kind: 'full' }],
    travel: 88,
    travelFrames: 20,
    travelFollowInput: true,
  });

  return moves;
}

/** 标准受击盒（大多数人都是这个身形） */
export function standardBoxes(): CharDef['boxes'] {
  return {
    stand: { x: -12, y: -78, w: 24, h: 78 },
    crouch: { x: -12, y: -50, w: 24, h: 50 },
    air: { x: -10, y: -72, w: 20, h: 72 },
  };
}
