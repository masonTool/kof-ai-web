import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/chars';
import {
  ARCADE_ROUTE,
  DIFFICULTY_RULES,
  afterStage,
  currentOpponent,
  isCleared,
  isGameOver,
  newArcade,
  rulesFor,
  stageLabel,
} from '../src/ui/arcade';
import { arcadeResult } from '../src/ui/arcade-result';

const ids = new Set(ROSTER.map((c) => c.id));

describe('单人街机路线', () => {
  it('正好 8 场，且每场队伍里的角色都在花名册里', () => {
    expect(ARCADE_ROUTE).toHaveLength(8);
    for (const o of ARCADE_ROUTE) {
      expect(o.team.length).toBeGreaterThanOrEqual(2);
      for (const id of o.team) expect(ids.has(id), `${o.name}: ${id}`).toBe(true);
    }
  });

  it('第 5 场是中 boss、第 8 场是最终 boss（大蛇）', () => {
    expect(ARCADE_ROUTE[4]!.kind).toBe('midboss');
    expect(ARCADE_ROUTE[7]!.kind).toBe('boss');
    expect(ARCADE_ROUTE[7]!.team).toContain('orochi');
  });

  it('难度越高 CPU 越强、血量越多', () => {
    expect(DIFFICULTY_RULES.easy.hpScale).toBeLessThan(DIFFICULTY_RULES.normal.hpScale);
    expect(DIFFICULTY_RULES.normal.hpScale).toBeLessThan(DIFFICULTY_RULES.hard.hpScale);
  });
});

describe('单人街机推进', () => {
  it('从第 1 场开始，赢了进下一场', () => {
    let s = newArcade('normal');
    expect(stageLabel(s)).toBe('1 / 8');
    expect(currentOpponent(s)?.name).toBe(ARCADE_ROUTE[0]!.name);
    s = afterStage(s, true);
    expect(s.stage).toBe(1);
    expect(s.wins).toBe(1);
    expect(stageLabel(s)).toBe('2 / 8');
  });

  it('连赢 8 场 = 通关（不是游戏结束）', () => {
    let s = newArcade('normal');
    for (let i = 0; i < 8; i++) s = afterStage(s, true);
    expect(isCleared(s)).toBe(true);
    expect(isGameOver(s)).toBe(false);
    expect(currentOpponent(s)).toBeNull(); // 没有第 9 场
  });

  it('输一场就结束，且不再推进', () => {
    let s = newArcade('hard');
    s = afterStage(s, true);
    s = afterStage(s, false);
    expect(isGameOver(s)).toBe(true);
    expect(s.stage).toBe(1);
    // 结束之后再调用不会把场次推上去
    expect(afterStage(s, true)).toBe(s);
  });

  it('难度规则直接给 CPU 等级与血量倍率', () => {
    expect(rulesFor(newArcade('easy')).cpuLevel).toBe('easy');
    expect(rulesFor(newArcade('hard')).hpScale).toBeGreaterThan(1);
  });
});

describe('街机结算模型', () => {
  it('进行中：显示下一场对手，可以继续', () => {
    const r = arcadeResult(newArcade('normal'));
    expect(r.title).toContain('1 / 8');
    expect(r.nextName).toBe(ARCADE_ROUTE[0]!.name);
    expect(r.canContinue).toBe(true);
    expect(r.cleared).toBe(false);
  });

  it('通关：标题是通关，没有下一场', () => {
    let s = newArcade('normal');
    for (let i = 0; i < 8; i++) s = afterStage(s, true);
    const r = arcadeResult(s);
    expect(r.cleared).toBe(true);
    expect(r.title).toBe('通关');
    expect(r.nextName).toBeNull();
    expect(r.canContinue).toBe(false);
  });

  it('中途失败：GAME OVER，并报出打到第几场', () => {
    let s = newArcade('normal');
    s = afterStage(s, true); // 赢 1 场
    s = afterStage(s, false); // 第 2 场输
    const r = arcadeResult(s);
    expect(r.title).toBe('GAME OVER');
    expect(r.subtitle).toContain('第 2 场');
    expect(r.canContinue).toBe(false);
  });
});
