import { describe, expect, it } from 'vitest';
import { CHALLENGES, ChallengeBoard, ChallengeRun } from '../src/ui/challenges';

const def = (kind: 'combo' | 'hits' | 'blocks' | 'super', goal: number) => ({
  id: `t-${kind}`,
  kind,
  goal,
  name: '测试',
  hint: '',
});

describe('单条挑战', () => {
  it('连段取历史最大段数，一次打够就永久完成', () => {
    const run = new ChallengeRun(def('combo', 3));
    run.hit(1, false);
    run.hit(2, false);
    expect(run.completed).toBe(false);
    run.hit(3, false);
    expect(run.completed).toBe(true);
    expect(run.progress).toBe(3);

    run.hit(1, false); // 之后只打 1 段，不该退回去
    expect(run.completed).toBe(true);
    expect(run.progress).toBe(3);
  });

  it('命中次数按次累加，到了就完成', () => {
    const run = new ChallengeRun(def('hits', 3));
    run.hit(1, false);
    run.hit(1, false);
    expect(run.progress).toBe(2);
    run.hit(1, false);
    expect(run.completed).toBe(true);
  });

  it('防御类只认防御，命中不推进', () => {
    const run = new ChallengeRun(def('blocks', 2));
    run.hit(1, false);
    expect(run.progress).toBe(0);
    run.block();
    expect(run.progress).toBe(1);
    run.block();
    expect(run.completed).toBe(true);
  });

  it('超必杀类只认超必杀命中', () => {
    const run = new ChallengeRun(def('super', 2));
    run.hit(1, false);
    expect(run.progress).toBe(0);
    run.hit(1, true);
    run.hit(2, false);
    expect(run.progress).toBe(1);
    run.hit(1, true);
    expect(run.completed).toBe(true);
  });

  it('完成后进度不再越界（不会显示 7/5）', () => {
    const run = new ChallengeRun(def('hits', 2));
    for (let i = 0; i < 10; i++) run.hit(1, false);
    expect(run.progress).toBe(2);
  });

  it('进度文本带目标', () => {
    const run = new ChallengeRun({ ...def('hits', 5), name: '命中 5 次' });
    run.hit(1, false);
    expect(run.label).toBe('命中 5 次  1/5');
  });

  it('reset 能重来', () => {
    const run = new ChallengeRun(def('hits', 1));
    run.hit(1, false);
    expect(run.completed).toBe(true);
    run.reset();
    expect(run.completed).toBe(false);
    expect(run.progress).toBe(0);
  });
});

describe('挑战面板', () => {
  it('默认五条挑战，选中第一条', () => {
    const board = new ChallengeBoard();
    expect(board.runs).toHaveLength(CHALLENGES.length);
    expect(board.current.def.id).toBe(CHALLENGES[0]!.id);
  });

  it('前后切换会环绕', () => {
    const board = new ChallengeBoard();
    board.prev();
    expect(board.index).toBe(CHALLENGES.length - 1);
    board.next();
    expect(board.index).toBe(0);
  });

  it('命中会推进所有挑战，不只是当前选中的', () => {
    const board = new ChallengeBoard();
    board.select(2); // 「命中 20 次」
    board.observeHit(5, true); // 5 段 + 超必杀
    const byId = new Map(board.runs.map((r) => [r.def.id, r]));
    expect(byId.get('combo3')!.completed).toBe(true);
    expect(byId.get('combo5')!.completed).toBe(true);
    expect(byId.get('hits20')!.progress).toBe(1);
    expect(byId.get('super2')!.progress).toBe(1);
  });

  it('刚好完成当前挑战时会返回 true（用于播提示）', () => {
    const board = new ChallengeBoard();
    board.select(0); // 连段 3 段
    expect(board.observeHit(2, false)).toBe(false);
    expect(board.observeHit(3, false)).toBe(true); // 这一下刚好够
    expect(board.observeHit(4, false)).toBe(false); // 已经完成过，不再重复提示
  });

  it('doneCount 统计完成条数', () => {
    const board = new ChallengeBoard();
    expect(board.doneCount).toBe(0);
    board.observeHit(5, true);
    expect(board.doneCount).toBeGreaterThan(0);
    board.resetAll();
    expect(board.doneCount).toBe(0);
  });

  it('select 越界会环绕，不会崩', () => {
    const board = new ChallengeBoard();
    board.select(99);
    expect(board.index).toBe(99 % CHALLENGES.length);
    expect(board.current).toBeDefined();
  });
});
