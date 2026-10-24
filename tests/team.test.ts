import { describe, expect, it } from 'vitest';
import { KYO } from '../src/data/chars/kyo';
import { IORI } from '../src/data/chars/iori';
import { Match, type MatchConfig } from '../src/game/match';
import { DEFAULT_MATCH } from '../src/game/match';

const FAST: Partial<MatchConfig> = { introFrames: 1, roundEndFrames: 3, swapIntroFrames: 1 };

function team(seed = 5): Match {
  return new Match([KYO, IORI], [IORI, KYO], FAST, seed);
}

function toFight(m: Match): Match {
  let guard = 0;
  while (m.phase === 'intro' && guard++ < 200) m.step();
  return m;
}

/** 把双方拉到能打到的距离 */
function closeIn(m: Match): void {
  m.p1.x = 220;
  m.p2.x = 260;
}

/** 打死 P2 当前角色，停在回合结束那一刻 */
function koP2(m: Match): void {
  toFight(m);
  closeIn(m);
  m.p2.hp = 5;
  m.p1.startMove(KYO.moves['5A']!);
  for (let i = 0; i < 20 && m.phase === 'fight'; i++) m.step();
}

/** 走完回合结束演出（停在下一段开场，不继续推进） */
function nextRound(m: Match, frames = 3): void {
  for (let i = 0; i < frames; i++) m.step();
}

describe('3v3 组队战', () => {
  it('开局双方都上第一个人', () => {
    const m = team();
    expect(m.teamMode).toBe(true);
    expect(m.p1.char.id).toBe('kyo');
    expect(m.p2.char.id).toBe('iori');
    expect(m.teamLeft(1)).toBe(2);
    expect(m.teamLeft(2)).toBe(2);
  });

  it('KO 后输的一方换人：满血、回到起始位置', () => {
    const m = team();
    m.p1.hp = 700; // 给赢家留个残血
    koP2(m);
    expect(m.p2.isDead).toBe(true);
    nextRound(m);

    expect(m.indexes[1]).toBe(1);
    expect(m.p2.char.id).toBe('kyo'); // 换成队伍里的第二人
    expect(m.p2.hp).toBe(m.p2.maxHp);
    expect(m.phase).toBe('intro');
  });

  it('赢家保留剩余血量，不会被回满', () => {
    const m = team();
    m.p1.hp = 640;
    koP2(m);
    nextRound(m);
    expect(m.p1.hp).toBe(640);
    expect(m.p1.char.id).toBe('kyo');
  });

  it('队伍被打空才结束整场', () => {
    const m = team();
    koP2(m);
    nextRound(m);
    // 打掉第二个
    koP2(m);
    nextRound(m);
    expect(m.phase).toBe('over');
    expect(m.matchWinner).toBe(1);
  });

  it('P1 的队伍也会被逐个打掉', () => {
    const m = team();
    toFight(m);
    closeIn(m);
    m.p1.hp = 5;
    m.p2.startMove(KYO.moves['5A']!);
    for (let i = 0; i < 20 && m.phase === 'fight'; i++) m.step();
    nextRound(m);
    expect(m.p1.char.id).toBe('iori'); // P1 换第二人
    expect(m.p1.hp).toBe(m.p1.maxHp);
  });

  it('HUD 的队伍人数跟着递减', () => {
    const m = team();
    expect(m.toHudModel().p2.teamLeft).toBe(2);
    koP2(m);
    nextRound(m);
    expect(m.toHudModel().p2.teamLeft).toBe(1);
  });

  it('双 KO 时两边都换人', () => {
    const m = team();
    toFight(m);
    closeIn(m);
    m.p1.hp = 5;
    m.p2.hp = 5;
    m.p1.startMove(KYO.moves['5A']!);
    m.p2.startMove(KYO.moves['5A']!);
    for (let i = 0; i < 24 && m.phase === 'fight'; i++) m.step();
    nextRound(m);
    expect(m.indexes).toEqual([1, 1]);
  });

  it('组队战里回合数会随着换人增加', () => {
    const m = team();
    expect(m.round).toBe(1);
    koP2(m);
    nextRound(m);
    expect(m.round).toBe(2);
  });
});

describe('单人模式不受影响', () => {
  it('单人还是三局两胜', () => {
    const m = new Match(KYO, IORI, { ...FAST }, 9);
    expect(m.teamMode).toBe(false);
    expect(m.teamLeft(1)).toBe(1);
    expect(DEFAULT_MATCH.roundsToWin).toBe(2);

    for (let round = 0; round < 2; round++) {
      toFight(m);
      closeIn(m);
      m.p2.hp = 5;
      m.p1.startMove(KYO.moves['5A']!);
      for (let i = 0; i < 20 && m.phase === 'fight'; i++) m.step();
      nextRound(m);
    }
    expect(m.phase).toBe('over');
    expect(m.matchWinner).toBe(1);
  });
});
