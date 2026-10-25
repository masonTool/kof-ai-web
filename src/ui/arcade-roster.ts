/**
 * 街机路线（角色 id）↔ 角色定义 的转换。
 *
 * 单独一层是为了让 `arcade.ts` 保持"纯数据 + 纯函数"——它不该知道 `CharDef` 长什么样，
 * 这样改路线、加角色、写测试都不用碰渲染或数据层。
 */
import { charById } from '../data/chars';
import type { CharDef } from '../data/schema';
import { currentOpponent, rulesFor, type ArcadeState } from './arcade';

export type CpuLevel = 'easy' | 'normal' | 'hard';

/**
 * 当前场次的对手队伍（3v3）。
 *
 * 路线里查不到的角色直接跳过——宁可 2 打 3，也不要因为一个 id 拼错就崩掉整条街机流程。
 */
export function arcadeTeam(state: ArcadeState): CharDef[] {
  const opponent = currentOpponent(state);
  if (!opponent) return [];
  const out: CharDef[] = [];
  for (const id of opponent.team) {
    const char = charById(id);
    if (char) out.push(char);
  }
  return out;
}

/** 当前场次的 CPU 等级与血量倍率（直接给对局用） */
export function arcadeRules(state: ArcadeState): { cpuLevel: CpuLevel; hpScale: number } {
  const r = rulesFor(state);
  return { cpuLevel: r.cpuLevel as CpuLevel, hpScale: r.hpScale };
}

/** 对手队伍的名字（VS 屏 / 结算屏用） */
export function arcadeTeamName(state: ArcadeState): string {
  return currentOpponent(state)?.name ?? '';
}
