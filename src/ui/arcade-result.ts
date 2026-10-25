/**
 * 街机结算屏的**数据模型**（纯逻辑，不含绘制）。
 *
 * 渲染层只吃这个模型，硬件/画布无关，所以"通关 / 中途失败"这类判定能被测试钉住，
 * 不用靠肉眼点一遍 8 场。
 */
import { ARCADE_ROUTE, isCleared, isGameOver, stageLabel, type ArcadeState } from './arcade';
import { endingFor } from './arcade-ending';

export interface ArcadeResultModel {
  /** 大标题：通关 / 失败 */
  title: string;
  /** 副标题：打到第几场 */
  subtitle: string;
  /** 下一场对手名（通关或失败时为 null） */
  nextName: string | null;
  /** 是否还能继续（只有通关前才继续） */
  canContinue: boolean;
  /** 是否通关 */
  cleared: boolean;
  /** 通关时的专属结局（失败/进行中为 null） */
  ending: { headline: string; line: string } | null;
}

export function arcadeResult(s: ArcadeState, player?: { id: string; name: string }): ArcadeResultModel {
  const cleared = isCleared(s);
  const failed = isGameOver(s);
  // 失败时停在当前场，"打了几场"用 wins 更直观
  const progress = cleared ? `全 ${ARCADE_ROUTE.length} 场通过` : `打到第 ${s.wins + 1} 场`;
  return {
    title: cleared ? '通关' : failed ? 'GAME OVER' : `第 ${stageLabel(s)} 场`,
    subtitle: cleared ? '你打赢了大蛇' : progress,
    nextName: cleared || failed ? null : (ARCADE_ROUTE[s.stage]?.name ?? null),
    canContinue: !cleared && !failed,
    cleared,
    // 通关才给结局：中途失败给"角色结局"是错的，玩家还没打完
    ending: cleared && player ? endingFor(player.id, player.name) : null,
  };
}
