import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { ROSTER } from '../src/data/chars';
import { AppFlow, DEFAULT_FLOW } from '../src/ui/flow';

const NONE = 0;

function makeFlow(): { flow: AppFlow; press(held: number): string; tap(btn: number): string } {
  const flow = new AppFlow(ROSTER);
  const press = (held: number): string => flow.step([{ held }, { held: NONE }]);
  const tap = (btn: number): string => {
    press(btn);
    return press(NONE);
  };
  return { flow, press, tap };
}

/** 空按若干帧（让计时器走），返回这段时间里出现过的动作 */
function idleActions(press: (held: number) => string, frames: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < frames; i++) {
    const a = press(NONE);
    if (a !== 'none') seen.push(a);
  }
  return seen;
}

function idle(press: (held: number) => string, frames: number): string {
  const seen = idleActions(press, frames);
  return seen[seen.length - 1] ?? 'none';
}

describe('标题屏', () => {
  it('开局在标题，按 A 进选人', () => {
    const { flow, tap } = makeFlow();
    expect(flow.screen).toBe('title');
    tap(Btn.A);
    expect(flow.screen).toBe('select');
    expect(flow.locked).toEqual([false, false]);
  });

  it('START 也能进', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.Start);
    expect(flow.screen).toBe('select');
  });
});

describe('选人屏', () => {
  it('方向键移动光标并环绕', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A);
    expect(flow.cursor[0]).toBe(0);
    tap(Btn.Right);
    expect(flow.cursor[0]).toBe(1);
    tap(Btn.Right);
    expect(flow.cursor[0]).toBe(0); // 环绕
    tap(Btn.Up); // 只有一行时上下移动不该越界
    expect(flow.cursor[0]).toBeGreaterThanOrEqual(0);
    expect(flow.cursor[0]).toBeLessThan(ROSTER.length);
  });

  it('A 确定、B 取消', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A);
    tap(Btn.A);
    expect(flow.locked[0]).toBe(true);
    tap(Btn.B);
    expect(flow.locked[0]).toBe(false);
  });

  it('电脑犹豫一会儿会自己选定', () => {
    const { flow, press, tap } = makeFlow();
    tap(Btn.A);
    idle(press, DEFAULT_FLOW.cpuThinkFrames - 2);
    expect(flow.locked[1]).toBe(false);
    idle(press, 3);
    expect(flow.locked[1]).toBe(true);
  });

  it('双方都确定后进 VS，并固定下两个角色', () => {
    const { flow, press, tap } = makeFlow();
    tap(Btn.A);
    tap(Btn.Right); // 光标到第 2 人
    tap(Btn.A); // 确定
    idle(press, DEFAULT_FLOW.cpuThinkFrames + 2);
    expect(flow.screen).toBe('vs');
    expect(flow.picks).not.toBeNull();
    expect(flow.picks![0].id).toBe(ROSTER[1]!.id);
    expect(ROSTER.map((c) => c.id)).toContain(flow.picks![1].id);
  });
});

describe('VS → 对战 → 结果', () => {
  function toFight(): { flow: AppFlow; press(held: number): string } {
    const { flow, press, tap } = makeFlow();
    tap(Btn.A);
    tap(Btn.A);
    idle(press, DEFAULT_FLOW.cpuThinkFrames + 2); // 进 VS
    idle(press, DEFAULT_FLOW.vsFrames + 1); // 进对战
    return { flow, press };
  }

  it('VS 演出结束会通知外层开打', () => {
    const { flow, press, tap } = makeFlow();
    tap(Btn.A);
    tap(Btn.A);
    idle(press, DEFAULT_FLOW.cpuThinkFrames + 2);
    expect(flow.screen).toBe('vs');
    const actions = idleActions(press, DEFAULT_FLOW.vsFrames + 3);
    expect(actions).toContain('start-match');
    expect(flow.screen).toBe('fight');
  });

  it('对局结束后进结果屏', () => {
    const { flow, press } = toFight();
    expect(flow.screen).toBe('fight');
    press(NONE);
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true });
    expect(flow.screen).toBe('result');
  });

  it('结果屏按 A 回标题', () => {
    const { flow, press } = toFight();
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true });
    idle(press, 35);
    expect(press(Btn.A)).toBe('to-title');
    expect(flow.screen).toBe('title');
    expect(flow.picks).toBeNull();
  });

  it('结果屏刚出现时按 A 不会立刻跳过', () => {
    const { flow, press } = toFight();
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true });
    expect(flow.screen).toBe('result');
    press(Btn.A);
    expect(flow.screen).toBe('result');
  });
});

describe('流程状态干净', () => {
  it('reset 回到标题并清空选择', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A);
    tap(Btn.A);
    flow.reset();
    expect(flow.screen).toBe('title');
    expect(flow.locked).toEqual([false, false]);
    expect(flow.picks).toBeNull();
  });

  it('同一串输入两次跑出同样结果（CPU 选人用固定种子）', () => {
    const run = (): string => {
      const { flow, press, tap } = makeFlow();
      tap(Btn.A);
      tap(Btn.A);
      idle(press, 60);
      return `${flow.screen}|${flow.picks?.map((c) => c.id).join(',')}`;
    };
    expect(run()).toBe(run());
  });
});
