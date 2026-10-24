/**
 * 连段补正：连段越长，后续单发伤害越低。
 *
 * KOF97 的补正曲线没有官方表，这里按"首段全伤害、之后每段递减、到 20% 保底"实现，
 * 表放一处，将来要校准只改这张表（见 docs/ARCHITECTURE.md §1 的口径）。
 */
const SCALE_TABLE = [1, 1, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2];
const MIN_SCALE = 0.2;
const MIN_DAMAGE = 1;

/** 第 `hitsBefore` 段之后的这一击吃到的倍率（0-based：第一段是 1.0） */
export function comboScale(hitsBefore: number): number {
  if (hitsBefore <= 0) return 1;
  const idx = Math.min(hitsBefore, SCALE_TABLE.length - 1);
  return Math.max(MIN_SCALE, SCALE_TABLE[idx]!);
}

/** 实际伤害（整数，至少 1） */
export function scaledDamage(base: number, hitsBefore: number): number {
  if (base <= 0) return 0;
  return Math.max(MIN_DAMAGE, Math.floor(base * comboScale(hitsBefore)));
}

/** 一次连段的过程值，挂在防守方身上 */
export interface ComboState {
  hits: number;
  damage: number;
  /** 本次连段里最大的一段伤害（UI 用） */
  best: number;
}

export function newCombo(): ComboState {
  return { hits: 0, damage: 0, best: 0 };
}

export function addComboHit(state: ComboState, damage: number): ComboState {
  state.hits += 1;
  state.damage += damage;
  if (damage > state.best) state.best = damage;
  return state;
}
