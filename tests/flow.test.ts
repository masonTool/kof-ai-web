import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { ROSTER } from '../src/data/chars';
import { AppFlow, DEFAULT_FLOW, MODE_ITEMS, gridColumns } from '../src/ui/flow';
import { SettingsStore, type StorageLike } from '../src/ui/settings';

const NONE = 0;

class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

interface Harness {
  flow: AppFlow;
  press(held: number, held2?: number): string;
  tap(btn: number, btn2?: number): string;
  idle(frames: number): string[];
  /** 标题 → 模式 → 街机（默认第一项）→ 选人 */
  toSelect(): void;
}

function makeFlow(settings: SettingsStore | null = null): Harness {
  const flow = new AppFlow(ROSTER, DEFAULT_FLOW, settings);
  const press = (held: number, held2 = NONE): string => flow.step([{ held }, { held: held2 }]);
  const tap = (btn: number, btn2 = NONE): string => {
    press(btn, btn2);
    return press(NONE);
  };
  const idle = (frames: number): string[] => {
    const seen: string[] = [];
    for (let i = 0; i < frames; i++) {
      const a = press(NONE);
      if (a !== 'none') seen.push(a);
    }
    return seen;
  };
  const toSelect = (): void => {
    tap(Btn.A); // 标题 → 模式
    tap(Btn.A); // 街机 → 选人
  };
  return { flow, press, tap, idle, toSelect };
}

describe('标题屏', () => {
  it('开局在标题，按 A 进模式选择', () => {
    const { flow, tap } = makeFlow();
    expect(flow.screen).toBe('title');
    tap(Btn.A);
    expect(flow.screen).toBe('mode');
  });

  it('START 也能进', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.Start);
    expect(flow.screen).toBe('mode');
  });
});

describe('模式选择', () => {
  it('五项：街机 / 双人 / 训练 / 观战 / 选项', () => {
    expect(MODE_ITEMS.map((m) => m.id)).toEqual(['arcade', 'versus', 'training', 'watch', 'options']);
  });

  it('上下移动光标并环绕', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A);
    expect(flow.modeCursor).toBe(0);
    tap(Btn.Down);
    expect(flow.modeCursor).toBe(1);
    tap(Btn.Up);
    tap(Btn.Up);
    expect(flow.modeCursor).toBe(MODE_ITEMS.length - 1); // 环绕到选项
  });

  it('选街机进选人，模式记为 arcade', () => {
    const { flow, toSelect } = makeFlow();
    toSelect();
    expect(flow.screen).toBe('select');
    expect(flow.mode).toBe('arcade');
  });

  it('选双人后 P2 由第二个输入源选人', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A); // 标题 → 模式
    tap(Btn.Down); // 光标到"双人对战"
    tap(Btn.A); // 进入选人
    expect(flow.mode).toBe('versus');

    tap(Btn.A); // P1 确定
    expect(flow.locked[0]).toBe(true);
    expect(flow.locked[1]).toBe(false); // 等 P2，CPU 不会替他选

    tap(Btn.A, Btn.A); // P2 确定（第二个输入源）
    expect(flow.locked[1]).toBe(true);
    expect(flow.screen).toBe('vs');
  });

  it('选训练模式跳过 VS 直接开打', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A);
    tap(Btn.Down);
    tap(Btn.Down); // 训练模式
    tap(Btn.A);
    expect(flow.mode).toBe('training');
    tap(Btn.A); // P1 确定
    const action = tap(Btn.A); // CPU 稍后确定 → 直接进对战
    // 需要等 CPU 思考帧
    for (let i = 0; i < DEFAULT_FLOW.cpuThinkFrames + 2 && flow.screen === 'select'; i++) {
      if (flow.step([{ held: 0 }, { held: 0 }]) === 'start-match') break;
    }
    expect(flow.screen).toBe('fight');
    expect(action === 'none' || action === 'start-match').toBe(true);
  });
});

describe('选项屏', () => {
  it('从模式选择进选项，左右改值并写回设置', () => {
    const store = new SettingsStore(new FakeStorage());
    const { flow, tap } = makeFlow(store);
    tap(Btn.A); // 标题 → 模式
    for (let i = 0; i < MODE_ITEMS.length - 1; i++) tap(Btn.Down); // 到"选项"
    tap(Btn.A);
    expect(flow.screen).toBe('options');
    expect(flow.optionCursor).toBe(0);

    const before = store.settings.roundsToWin;
    tap(Btn.Right);
    expect(store.settings.roundsToWin).not.toBe(before);
    tap(Btn.Left);
    expect(store.settings.roundsToWin).toBe(before);
  });

  it('B 返回模式选择', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A);
    for (let i = 0; i < MODE_ITEMS.length - 1; i++) tap(Btn.Down);
    tap(Btn.A);
    tap(Btn.B);
    expect(flow.screen).toBe('mode');
  });

  it('每一行都能选到（上下环绕）', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A);
    for (let i = 0; i < MODE_ITEMS.length - 1; i++) tap(Btn.Down);
    tap(Btn.A);
    // 7 项设置 + 1 条"按键设置 →"
    expect(flow.options.length).toBe(7);
    expect(flow.optionCount).toBe(8);
    for (let i = 0; i < flow.optionCount; i++) tap(Btn.Down);
    expect(flow.optionCursor).toBe(0); // 转一圈回到第一行
  });
});

describe('按键设置入口', () => {
  it('选项屏最后一行能进按键设置，B 再退回来', () => {
    const { flow, tap } = makeFlow();
    tap(Btn.A); // 标题 → 模式
    for (let i = 0; i < MODE_ITEMS.length - 1; i++) tap(Btn.Down);
    tap(Btn.A); // 进选项
    for (let i = 0; i < flow.options.length; i++) tap(Btn.Down); // 到"按键设置"
    expect(flow.onKeybindRow).toBe(true);
    tap(Btn.A);
    expect(flow.screen).toBe('keybind');
    tap(Btn.B);
    expect(flow.screen).toBe('options');
  });

  it('从暂停进来的选项，返回时回到对战（而不是模式选择）', () => {
    const { flow, tap } = makeFlow();
    flow.optionsFrom = 'fight';
    tap(Btn.A);
    for (let i = 0; i < MODE_ITEMS.length - 1; i++) tap(Btn.Down);
    tap(Btn.A);
    tap(Btn.B);
    expect(flow.screen).toBe('fight');
  });
});

describe('选人屏', () => {
  it('方向键移动光标并环绕', () => {
    const { flow, tap, toSelect } = makeFlow();
    toSelect();
    expect(flow.cursor[0]).toBe(0);
    tap(Btn.Right);
    expect(flow.cursor[0]).toBe(1);
    for (let i = 1; i < ROSTER.length; i++) tap(Btn.Right);
    expect(flow.cursor[0]).toBe(0); // 转一圈
    tap(Btn.Up);
    expect(flow.cursor[0]).toBeGreaterThanOrEqual(0);
    expect(flow.cursor[0]).toBeLessThan(ROSTER.length);
  });

  it('A 确定、B 取消', () => {
    const { flow, tap, toSelect } = makeFlow();
    toSelect();
    tap(Btn.A);
    expect(flow.locked[0]).toBe(true);
    tap(Btn.B);
    expect(flow.locked[0]).toBe(false);
  });

  it('电脑犹豫一会儿会自己选定', () => {
    const { flow, idle, toSelect } = makeFlow();
    toSelect();
    idle(DEFAULT_FLOW.cpuThinkFrames - 2);
    expect(flow.locked[1]).toBe(false);
    idle(3);
    expect(flow.locked[1]).toBe(true);
  });

  it('双方都确定后进 VS，并固定下两个角色', () => {
    const { flow, tap, idle, toSelect } = makeFlow();
    toSelect();
    tap(Btn.Right);
    tap(Btn.A);
    idle(DEFAULT_FLOW.cpuThinkFrames + 2);
    expect(flow.screen).toBe('vs');
    expect(flow.picks).not.toBeNull();
    expect(flow.picks![0].id).toBe(ROSTER[1]!.id);
  });

  it('栅格列数随人数变化', () => {
    expect(gridColumns(8)).toBe(4);
    expect(gridColumns(16)).toBe(5);
    expect(gridColumns(29)).toBe(6);
    expect(gridColumns(40)).toBe(8);
  });
});

describe('VS → 对战 → 结果', () => {
  function toFight(mode: 'arcade' | 'versus' = 'arcade'): Harness {
    const h = makeFlow();
    h.tap(Btn.A); // 标题 → 模式
    if (mode === 'versus') h.tap(Btn.Down);
    h.tap(Btn.A); // 进选人
    h.tap(Btn.A); // P1 确定
    if (mode === 'versus') h.tap(Btn.A, Btn.A); // P2 自己确定
    h.idle(DEFAULT_FLOW.cpuThinkFrames + 2); // CPU 确定（街机）
    h.idle(DEFAULT_FLOW.vsFrames + 3);
    return h;
  }

  it('VS 演出结束会通知外层开打', () => {
    const { flow, idle, tap } = makeFlow();
    tap(Btn.A);
    tap(Btn.A);
    tap(Btn.A);
    idle(DEFAULT_FLOW.cpuThinkFrames + 2);
    expect(flow.screen).toBe('vs');
    const actions = idle(DEFAULT_FLOW.vsFrames + 3);
    expect(actions).toContain('start-match');
    expect(flow.screen).toBe('fight');
  });

  it('对局结束后进结果屏', () => {
    const { flow, press } = toFight();
    expect(flow.screen).toBe('fight');
    press(NONE);
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 1 });
    expect(flow.screen).toBe('result');
  });

  it('结果屏按 A 回标题', () => {
    const { flow, press, idle } = toFight();
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 1 });
    idle(DEFAULT_FLOW.resultLockFrames + 5);
    expect(press(Btn.A)).toBe('to-title');
    expect(flow.screen).toBe('title');
    expect(flow.picks).toBeNull();
  });

  it('结果屏刚出现时按 A 不会立刻跳过', () => {
    const { flow, press } = toFight();
    flow.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 1 });
    expect(flow.screen).toBe('result');
    press(Btn.A);
    expect(flow.screen).toBe('result');
  });
});

describe('续关（街机模式输掉）', () => {
  function loseToCpu(): Harness {
    const h = makeFlow();
    h.tap(Btn.A);
    h.tap(Btn.A);
    h.tap(Btn.A);
    h.idle(DEFAULT_FLOW.cpuThinkFrames + 2);
    h.idle(DEFAULT_FLOW.vsFrames + 3);
    h.flow.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 2 });
    return h;
  }

  it('输给 CPU 会进续关屏而不是直接结束', () => {
    const { flow } = loseToCpu();
    expect(flow.screen).toBe('continue');
    expect(flow.continueLeft).toBe(DEFAULT_FLOW.continueFrames);
  });

  it('倒计时会往下走', () => {
    const { flow, press } = loseToCpu();
    press(NONE);
    expect(flow.continueLeft).toBe(DEFAULT_FLOW.continueFrames - 1);
  });

  it('按 A 续关：沿用同一组角色重开', () => {
    const { flow, press } = loseToCpu();
    const picks = flow.picks!.map((c) => c.id);
    expect(press(Btn.A)).toBe('start-match');
    expect(flow.screen).toBe('fight');
    expect(flow.picks!.map((c) => c.id)).toEqual(picks);
    expect(flow.continues).toBe(1);
  });

  it('倒计时结束回标题', () => {
    const { flow, press } = loseToCpu();
    let action = 'none';
    for (let i = 0; i < DEFAULT_FLOW.continueFrames + 2; i++) {
      action = press(NONE);
      if (action === 'to-title') break;
    }
    expect(action).toBe('to-title');
    expect(flow.screen).toBe('title');
  });

  it('双人对战输掉不进续关', () => {
    const h = makeFlow();
    h.tap(Btn.A);
    h.tap(Btn.Down); // 双人
    h.tap(Btn.A);
    h.tap(Btn.A);
    h.tap(Btn.A, Btn.A);
    h.idle(DEFAULT_FLOW.vsFrames + 3);
    h.flow.step([{ held: 0 }, { held: 0 }], { matchOver: true, matchWinner: 2 });
    expect(h.flow.screen).toBe('result');
  });
});

describe('流程状态干净', () => {
  it('reset 回到标题并清空选择与续关计数', () => {
    const { flow, tap, toSelect } = makeFlow();
    toSelect();
    tap(Btn.A);
    flow.continues = 3;
    flow.reset();
    expect(flow.screen).toBe('title');
    expect(flow.mode).toBe('arcade');
    expect(flow.locked).toEqual([false, false]);
    expect(flow.picks).toBeNull();
    expect(flow.continues).toBe(0);
  });

  it('同一串输入两次跑出同样结果（CPU 选人用固定种子）', () => {
    const run = (): string => {
      const { flow, idle, toSelect, tap } = makeFlow();
      toSelect();
      tap(Btn.A);
      idle(60);
      return `${flow.screen}|${flow.picks?.map((c) => c.id).join(',')}`;
    };
    expect(run()).toBe(run());
  });
});
