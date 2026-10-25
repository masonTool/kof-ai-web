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
/**
 * 每一场的实际强度。
 *
 * 原来整条路线只有三档固定难度（选什么难度全场一样），8 场打下来手感是平的：
 * 第 1 场和最终 boss 前一场一样凶。这里按**场次位置**做爬坡——
 * 前两场放水，中段正常，中 boss 开始加压，最后一场拉满。
 */
export function arcadeRules(state: ArcadeState): { cpuLevel: CpuLevel; hpScale: number } {
  const base = rulesFor(state);
  const stage = state.stage; // 0-based：0..7
  // 前 2 场降一档（让玩家先摸清操作），中 boss（第 5 场）起按基础档，最终场再压一层血量
  const levels: CpuLevel[] = ['easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'hard'];
  const cpuLevel = levels[Math.min(stage, levels.length - 1)] ?? (base.cpuLevel as CpuLevel);
  // 血量：用户设定的难度倍率 × 场次爬坡（第 1 场 0.9 → 第 8 场 1.3）
  const ramp = 0.9 + (stage / 7) * 0.4;
  return { cpuLevel, hpScale: Number((base.hpScale * ramp).toFixed(3)) };
}

/** 对手队伍的名字（VS 屏 / 结算屏用） */
export function arcadeTeamName(state: ArcadeState): string {
  return currentOpponent(state)?.name ?? '';
}
