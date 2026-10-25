/**
 * 单人街机：8 场的路线、难度与推进（纯逻辑，不碰 DOM/渲染）。
 *
 * 路线的取舍：KOF97 是「队伍 → 队伍 → 中 boss → 队伍 → boss」，
 * 8 场太长且中段重复，这里压成 8 场但保留节奏感：
 * 前 4 场是普通队伍，第 5 场中 boss，第 6~7 场强队，第 8 场最终 boss（大蛇）。
 */
export type ArcadeDifficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_LABEL: Record<ArcadeDifficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

/** 难度 → CPU 等级与血量倍率（血量倍率只作用在 CPU 队伍上） */
export const DIFFICULTY_RULES: Record<ArcadeDifficulty, { cpuLevel: string; hpScale: number; label: string }> = {
  easy: { cpuLevel: 'easy', hpScale: 0.85, label: '简单' },
  normal: { cpuLevel: 'normal', hpScale: 1, label: '普通' },
  hard: { cpuLevel: 'hard', hpScale: 1.15, label: '困难' },
};

export type ArcadeOpponentKind = 'team' | 'midboss' | 'boss';

export interface ArcadeOpponent {
  /** 队伍成员的角色 id（按出场顺序） */
  team: readonly string[];
  kind: ArcadeOpponentKind;
  /** 显示用名字 */
  name: string;
}

/** 8 场路线：4 支队伍 → 中 boss → 2 支强队 → 大蛇 */
export const ARCADE_ROUTE: readonly ArcadeOpponent[] = [
  { team: ['benimaru', 'daimon', 'shingo'], kind: 'team', name: '日本队' },
  { team: ['andy', 'joe', 'terry'], kind: 'team', name: '饿狼队' },
  { team: ['robert', 'yuri', 'ryo'], kind: 'team', name: '龙虎队' },
  { team: ['ralf', 'clark', 'leona'], kind: 'team', name: '怒队' },
  { team: ['eiji', 'billy', 'iori'], kind: 'midboss', name: '中 boss · 八神队' },
  { team: ['kensou', 'chin', 'athena'], kind: 'team', name: '超能力队' },
  { team: ['yashiro', 'shermie', 'chris'], kind: 'team', name: '新面孔队' },
  { team: ['goenitz', 'orochi'], kind: 'boss', name: '最终 boss · 大蛇' },
];

export interface ArcadeState {
  difficulty: ArcadeDifficulty;
  /** 当前第几场（0 起） */
  stage: number;
  /** 已获胜场次 */
  wins: number;
  over: boolean;
}

export function newArcade(difficulty: ArcadeDifficulty = 'normal'): ArcadeState {
  return { difficulty, stage: 0, wins: 0, over: false };
}

export function currentOpponent(s: ArcadeState): ArcadeOpponent | null {
  return ARCADE_ROUTE[s.stage] ?? null;
}

export function stageLabel(s: ArcadeState): string {
  return `${Math.min(s.stage + 1, ARCADE_ROUTE.length)} / ${ARCADE_ROUTE.length}`;
}

/** 这一场 CPU 用的难度规则 */
export function rulesFor(s: ArcadeState): { cpuLevel: string; hpScale: number } {
  const r = DIFFICULTY_RULES[s.difficulty];
  return { cpuLevel: r.cpuLevel, hpScale: r.hpScale };
}

/**
 * 打完一场：赢了进下一场（打穿最后一场就通关），输了直接结束。
 * 返回新的状态，不改原对象（回放/重开都好处理）。
 */
export function afterStage(s: ArcadeState, playerWon: boolean): ArcadeState {
  if (s.over) return s;
  if (!playerWon) return { ...s, over: true };
  const next = s.stage + 1;
  return { ...s, stage: next, wins: s.wins + 1, over: next >= ARCADE_ROUTE.length };
}

/** 通关（打完全部 8 场） */
export function isCleared(s: ArcadeState): boolean {
  return s.wins >= ARCADE_ROUTE.length;
}

/** 中途输了 */
export function isGameOver(s: ArcadeState): boolean {
  return s.over && !isCleared(s);
}
