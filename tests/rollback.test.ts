import { describe, expect, it } from 'vitest';
import { makeInput, Btn } from '../src/core/input';
import { KYO } from '../src/data/chars/kyo';
import { IORI } from '../src/data/chars/iori';
import { RollbackSession } from '../src/net/rollback';

const CFG = { introFrames: 1, roundEndFrames: 1 };
const IDLE = makeInput(0);

function mk(): RollbackSession {
  return new RollbackSession(KYO, IORI, CFG, 7);
}

describe('回滚（保存输入 + 重放）', () => {
  it('从头重放得到的 hash 与当前状态一致（模拟层是自洽的）', () => {
    const s = mk();
    for (let i = 0; i < 40; i++) {
      s.step([i % 3 === 0 ? makeInput(Btn.A) : IDLE, IDLE]);
    }
    expect(s.verifyDeterministic()).toBe(true);
  });

  it('回滚并替换输入后，状态与"直接这么打"一致', () => {
    // A：先随便打 20 帧
    const a = mk();
    for (let i = 0; i < 20; i++) a.step([IDLE, IDLE]);

    // B：同样打 20 帧，但第 10 帧的输入不同
    const b = mk();
    const frames = [] as { inputs: readonly [ReturnType<typeof makeInput>, ReturnType<typeof makeInput>] }[];
    for (let i = 0; i < 20; i++) {
      const inp = i === 10 ? makeInput(Btn.A) : IDLE;
      frames.push({ inputs: [inp, IDLE] as const });
      b.step([inp, IDLE]);
    }

    // A 回滚到第 10 帧，补上"第 10 帧其实按了 A"，再重放 10..19
    a.rewindTo(10, frames.slice(10));
    expect(a.match.hash()).toBe(b.match.hash());
    expect(a.frame).toBe(20);
  });

  it('回滚帧号越界会明确报错（不静默）', () => {
    const s = mk();
    for (let i = 0; i < 5; i++) s.step([IDLE, IDLE]);
    expect(() => s.rewindTo(99, [])).toThrow(/越界/);
    expect(() => s.rewindTo(-1, [])).toThrow(/越界/);
  });

  it('回滚到当前帧（替换为空）等于什么都不做', () => {
    const s = mk();
    for (let i = 0; i < 12; i++) s.step([IDLE, IDLE]);
    const before = s.match.hash();
    s.rewindTo(12, []);
    expect(s.match.hash()).toBe(before);
  });
});
