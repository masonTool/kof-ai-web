import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/chars';
import { Btn } from '../src/core/input';
import { AppFlow, DEFAULT_FLOW } from '../src/ui/flow';
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
import { arcadeRules, arcadeTeam, arcadeTeamName } from '../src/ui/arcade-roster';

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

describe('路线 → 队伍', () => {
  it('每一场都能解析出 2 人以上的队伍，且都是花名册里的角色', () => {
    let s = newArcade('normal');
    for (let i = 0; i < 8; i++) {
      const team = arcadeTeam(s);
      expect(team.length, `第 ${i + 1} 场`).toBeGreaterThanOrEqual(2);
      for (const c of team) expect(ids.has(c.id), c.id).toBe(true);
      s = afterStage(s, true);
    }
    expect(arcadeTeam(s)).toEqual([]); // 打完之后没有对手
  });

  it('第一场的对手就是路线表的第一支队伍', () => {
    const team = arcadeTeam(newArcade('normal'));
    expect(team.map((c) => c.id)).toEqual([...ARCADE_ROUTE[0]!.team]);
    expect(arcadeTeamName(newArcade('normal'))).toBe(ARCADE_ROUTE[0]!.name);
  });

  it('第 1 场放水：整条路线从简单起步（不是一上来就 hardest）', () => {
    expect(arcadeRules(newArcade('normal')).cpuLevel).toBe('easy');
    expect(arcadeRules(newArcade('easy')).hpScale).toBeLessThan(0.85);
  });

  it('难度随场次爬坡：第 8 场明显强于第 1 场', () => {
    let s = newArcade('normal');
    const first = arcadeRules(s);
    for (let i = 0; i < 7; i++) s = afterStage(s, true);
    const last = arcadeRules(s);
    expect(last.cpuLevel).toBe('hard');
    expect(last.hpScale).toBeGreaterThan(first.hpScale);
  });

  it('玩家选的难度仍然起作用（同场次下 hard 血量更高）', () => {
    expect(arcadeRules(newArcade('hard')).hpScale).toBeGreaterThan(arcadeRules(newArcade('easy')).hpScale);
  });
});

describe('街机流程（flow 层，不需要真打）', () => {
  const mkFlow = (): AppFlow => {
    const flow = new AppFlow(ROSTER, { ...DEFAULT_FLOW, vsFrames: 1, resultLockFrames: 1 }, null);
    flow.screen = 'fight';
    flow.mode = 'arcade';
    return flow;
  };

  it('赢了：nextArcadeStage 把屏幕切到 vs，随后返回 start-match 重开对局', () => {
    const flow = mkFlow();
    flow.nextArcadeStage();
    expect(flow.screen).toBe('vs');
    let action = 'none';
    for (let i = 0; i < 50 && action === 'none'; i++) {
      action = flow.step([{ held: 0 }, { held: 0 }], { matchOver: false, matchWinner: 0 });
    }
    expect(action).toBe('start-match');
    expect(flow.screen).toBe('fight');
  });

  it('通关/失败：showArcadeResult 停在结算屏，按一下才回标题', () => {
    const flow = mkFlow();
    flow.showArcadeResult();
    expect(flow.screen).toBe('result');
    // 结算屏有锁定期，连按两帧才走
    const step = (): string =>
      flow.step([{ held: Btn.A }, { held: 0 }], { matchOver: true, matchWinner: 1 });
    expect(step()).toBe('none'); // 锁定期内按下无效
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 1 }); // 松手
    expect(step()).toBe('to-title'); // 再按一次才走
  });

  it('街机输给 CPU 才给续关机会，赢了不弹续关', () => {
    const flow = mkFlow();
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 1 });
    expect(flow.screen).toBe('result');
    const flow2 = mkFlow();
    flow2.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 2 });
    expect(flow2.screen).toBe('continue');
  });
});
