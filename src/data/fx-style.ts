/**
 * 每个角色的"气质"：命中火花用什么颜色。
 *
 * 只对**必杀/超必杀**生效——通常技砍谁都一样是白火花，否则 29 个人打起来满屏彩色，
 * 反而看不出谁是谁。招式里写了 `fx` 就以招式为准（比如大蛇的普通技也想带光，就显式写）。
 */
import type { FxStyle, MoveDef, ProjectileShape } from './schema';

/** 角色默认气质（没列到的 = 无属性，只有普通火花） */
export const CHAR_FX_STYLE: Record<string, FxStyle> = {
  kyo: 'fire',
  iori: 'darkfire',
  benimaru: 'thunder',
  daimon: 'none',
  terry: 'ki',
  andy: 'ki',
  joe: 'wind',
  ryo: 'ki',
  robert: 'ki',
  yuri: 'ki',
  leona: 'wind',
  ralf: 'none',
  clark: 'none',
  athena: 'ki',
  kensou: 'ki',
  chin: 'none',
  kim: 'wind',
  chang: 'none',
  choi: 'wind',
  billy: 'fire',
  eiji: 'none',
  shingo: 'fire',
  yashiro: 'none',
  shermie: 'thunder',
  chris: 'fire',
  orochi_iori: 'darkfire',
  orochi_leona: 'wind',
  goenitz: 'wind',
  orochi: 'ki',
};

/**
 * 这一击该用什么特效。
 * 规则：招式显式写了就用写的；否则只有必杀/超必杀才带属性；再否则无色。
 */
export function styleOfMove(charId: string, move: MoveDef | null): FxStyle {
  if (!move) return 'none';
  if (move.fx !== undefined) return move.fx;
  if (move.kind !== 'special' && move.kind !== 'super') return 'none';
  return CHAR_FX_STYLE[charId] ?? 'none';
}

/**
 * 飞行道具的形状：默认按属性推，招式里写了 `shape` 就以招式为准。
 * 这样"火球是火柱、雷是电气波、风是风刃"不用逐个角色手写一遍，
 * 但想特例（比如大蛇的裁判断面）也能单独指定。
 */
export function shapeOfProjectile(style: FxStyle, override?: ProjectileShape): ProjectileShape {
  if (override !== undefined) return override;
  switch (style) {
    case 'fire':
    case 'darkfire':
      return 'flame';
    case 'thunder':
      return 'wave';
    case 'wind':
      return 'blade';
    default:
      return 'orb';
  }
}
