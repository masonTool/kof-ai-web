/**
 * 角色派生：同一套招式表，换 id / 名字 / 色板，按倍率调整伤害与速度。
 *
 * 用途：暴走版（暴走庵 / 暴走莉安娜）这类"动作一样、数值不同"的角色。
 * 关键点：招式表必须**深拷贝**——共用同一个对象的话，给暴走版调一次伤害，
 * 本体也跟着变，这种 bug 在数据层很难发现。
 */
import type { CharDef, MoveDef, Palette } from '../schema';

export interface VariantOptions {
  id: string;
  name: string;
  palette: Palette;
  /** 最大血量（默认沿用本体） */
  hp?: number;
  /** 伤害倍率（默认 1） */
  damage?: number;
  /** 帧数倍率：< 1 更快（默认 1） */
  speed?: number;
}

function scaleMoves(moves: Record<string, MoveDef>, damage: number, speed: number): Record<string, MoveDef> {
  const cloned = JSON.parse(JSON.stringify(moves)) as Record<string, MoveDef>;
  for (const move of Object.values(cloned)) {
    if (speed !== 1) move.total = Math.max(8, Math.round(move.total * speed));
    for (const h of move.hits) {
      if (damage !== 1) h.damage = Math.max(1, Math.round(h.damage * damage));
      if (speed !== 1) {
        h.hitStun = Math.max(6, Math.round(h.hitStun * speed));
        h.blockStun = Math.max(3, Math.round(h.blockStun * speed));
      }
    }
    if (move.projectile && damage !== 1) {
      move.projectile.hit.damage = Math.max(1, Math.round(move.projectile.hit.damage * damage));
    }
  }
  return cloned;
}

/** 由本体派生一个新角色（深拷贝招式表） */
export function variantOf(base: CharDef, opts: VariantOptions): CharDef {
  return {
    ...base,
    id: opts.id,
    name: opts.name,
    palette: opts.palette,
    hp: opts.hp ?? base.hp,
    walk: { fwd: base.walk.fwd, back: base.walk.back },
    jump: { ...base.jump },
    boxes: {
      stand: { ...base.boxes.stand },
      crouch: { ...base.boxes.crouch },
      air: { ...base.boxes.air },
    },
    push: base.push ? { ...base.push } : undefined,
    moves: scaleMoves(base.moves, opts.damage ?? 1, opts.speed ?? 1),
  };
}
