import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { KYO } from '../src/data/chars/kyo';
import { IORI } from '../src/data/chars/iori';
import { charById } from '../src/data/chars';
import { DEFAULT_MATCH, Match } from '../src/game/match';
import {
  REPLAY_VERSION,
  ReplayPlayer,
  ReplayRecorder,
  matchFromReplay,
  parseReplay,
  serializeReplay,
  type Replay,
} from '../src/game/replay';

const SEED = 0x970317;

function newMatch(): Match {
  return new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 3 }, SEED);
}

/** 一段固定的"输入剧本"：走、跳、出拳、摇必杀，够覆盖状态机 */
function script(frame: number): [number, number] {
  if (frame < 10) return [0, 0];
  if (frame % 37 === 0) return [Btn.A, 0];
  if (frame % 23 === 0) return [Btn.Right, Btn.Left];
  if (frame % 41 === 0) return [Btn.Up | Btn.Right, 0];
  if (frame % 53 === 0) return [Btn.Down, 0];
  if (frame % 61 === 0) return [Btn.C | Btn.D, 0];
  return [0, 0];
}

function makeReplay(frames = 300): Replay {
  const match = newMatch();
  const rec = new ReplayRecorder({ seed: SEED, config: match.config, teams: [['kyo'], ['iori']] });
  for (let i = 0; i < frames; i++) {
    const [a, b] = script(i);
    rec.record([{ held: a }, { held: b }]);
    match.step([{ held: a }, { held: b }]);
  }
  return rec.finish();
}

describe('录制', () => {
  it('录的帧数与喂进去的一致，输入按位掩码保存', () => {
    const rec = new ReplayRecorder({ seed: 1, config: DEFAULT_MATCH, teams: [['kyo'], ['iori']] });
    rec.record([{ held: Btn.A | Btn.Down }, { held: Btn.Left }]);
    rec.record([{ held: 0 }, { held: 0 }]);
    expect(rec.frames).toBe(2);
    const replay = rec.finish();
    expect(replay.version).toBe(REPLAY_VERSION);
    expect(replay.inputs).toEqual([
      [Btn.A | Btn.Down, Btn.Left],
      [0, 0],
    ]);
  });

  it('finish 拿到的队伍是副本（改回放不影响原数据）', () => {
    const teams: [string[], string[]] = [['kyo'], ['iori']];
    const rec = new ReplayRecorder({ seed: 1, config: DEFAULT_MATCH, teams });
    rec.record([{ held: 0 }, { held: 0 }]);
    const replay = rec.finish();
    replay.teams[0].push('改一下');
    expect(teams[0]).toEqual(['kyo']);
  });
});

describe('重演（确定性的最强断言）', () => {
  it('重演 300 帧，每 50 帧的哈希与原局逐步相同', () => {
    const match = newMatch();
    const rec = new ReplayRecorder({ seed: SEED, config: match.config, teams: [['kyo'], ['iori']] });
    const hashes: string[] = [];
    for (let i = 0; i < 300; i++) {
      const [a, b] = script(i);
      rec.record([{ held: a }, { held: b }]);
      match.step([{ held: a }, { held: b }]);
      if (i % 50 === 0) hashes.push(match.hash());
    }

    const replay = rec.finish();
    const replayMatch = matchFromReplay(replay, charById);
    const player = new ReplayPlayer(replay);
    const replayHashes: string[] = [];
    for (let i = 0; i < 300; i++) {
      replayMatch.step(player.next());
      if (i % 50 === 0) replayHashes.push(replayMatch.hash());
    }
    expect(replayHashes).toEqual(hashes);
    expect(player.done).toBe(true);
  });

  it('录到一半截断，重演到截断处仍然一致（可以边播边停）', () => {
    const full = makeReplay(120);
    const half: Replay = { ...full, inputs: full.inputs.slice(0, 60) };
    const m = matchFromReplay(half, charById);
    const player = new ReplayPlayer(half);
    for (let i = 0; i < 60; i++) m.step(player.next());
    expect(player.done).toBe(true);

    const m2 = matchFromReplay(full, charById);
    const p2 = new ReplayPlayer(full);
    for (let i = 0; i < 60; i++) m2.step(p2.next());
    expect(m.hash()).toBe(m2.hash());
  });

  it('录完之后再 next 给空输入，不抛错', () => {
    const replay = makeReplay(2);
    const player = new ReplayPlayer(replay);
    player.next();
    player.next();
    expect(player.done).toBe(true);
    expect(player.next()).toEqual([{ held: 0 }, { held: 0 }]);
    expect(player.next()).toEqual([{ held: 0 }, { held: 0 }]);
  });

  it('reset 能从头再播一遍', () => {
    const replay = makeReplay(30);
    const player = new ReplayPlayer(replay);
    for (let i = 0; i < 10; i++) player.next();
    player.reset();
    expect(player.position).toBe(0);
    expect(player.done).toBe(false);
  });
});

describe('序列化与消毒', () => {
  it('JSON 往返后内容不变', () => {
    const replay = makeReplay(40);
    const round = parseReplay(JSON.parse(serializeReplay(replay)));
    expect(round).toEqual(replay);
  });

  it('脏数据一律返回 null（不抛错）', () => {
    expect(parseReplay(null)).toBeNull();
    expect(parseReplay('字符串')).toBeNull();
    expect(parseReplay({})).toBeNull();
    expect(parseReplay({ version: 999 })).toBeNull();
    expect(parseReplay({ version: REPLAY_VERSION, seed: 1, teams: [['kyo'], ['iori']], inputs: [] })).toBeNull();
    expect(parseReplay({ version: REPLAY_VERSION, seed: 1, teams: [['kyo']], inputs: [[0, 0]] })).toBeNull();
    expect(parseReplay({ version: REPLAY_VERSION, seed: 1, teams: [['kyo'], ['iori']], inputs: [[0]] })).toBeNull();
    expect(parseReplay({ version: REPLAY_VERSION, seed: 1, teams: [['kyo'], ['iori']], inputs: [['a', 0]] })).toBeNull();
  });

  it('局数与时间会被夹到合法范围', () => {
    const replay = parseReplay({
      version: REPLAY_VERSION,
      seed: 1,
      config: { roundsToWin: 99, roundSeconds: -5 },
      teams: [['kyo'], ['iori']],
      inputs: [[0, 0]],
    });
    expect(replay!.config.roundsToWin).toBe(3);
    expect(replay!.config.roundSeconds).toBe(10);
  });

  it('未知角色会抛错（数据问题不该静默吞掉）', () => {
    const replay = makeReplay(5);
    const broken: Replay = { ...replay, teams: [['不存在的角色'], ['iori']] };
    expect(() => matchFromReplay(broken, charById)).toThrow(/未知角色/);
  });
});
