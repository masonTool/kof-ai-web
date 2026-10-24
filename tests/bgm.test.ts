import { describe, expect, it } from 'vitest';
import {
  BgmPlayer,
  NullBgm,
  TRACKS,
  WebAudioBgm,
  midiToHz,
  stepDurationMs,
  stepIndexAt,
  type TrackDef,
} from '../src/audio/bgm';

const FIGHT = TRACKS['fight']!;

describe('曲子数据', () => {
  it('三条曲子都在，步数与音符数组长度一致', () => {
    expect(Object.keys(TRACKS).sort()).toEqual(['fight', 'result', 'title']);
    for (const [id, track] of Object.entries(TRACKS)) {
      expect(track.lead.length, id).toBe(track.steps);
      expect(track.bass.length, id).toBe(track.steps);
      expect(track.bpm, id).toBeGreaterThan(40);
      expect(track.gain, id).toBeGreaterThan(0);
      expect(track.gain, id).toBeLessThanOrEqual(0.3);
    }
  });

  it('音高换算正确（A4 = 440）', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
    expect(midiToHz(81)).toBeCloseTo(880, 5);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });
});

describe('节拍换算', () => {
  it('150bpm、每拍 4 步 → 每步 100ms', () => {
    expect(stepDurationMs(FIGHT)).toBeCloseTo(100, 5);
    expect(stepIndexAt(FIGHT, 0)).toBe(0);
    expect(stepIndexAt(FIGHT, 250)).toBe(2);
    expect(stepIndexAt(FIGHT, 100 * FIGHT.steps)).toBe(0); // 循环回绕
  });

  it('负时间按 0 处理', () => {
    expect(stepIndexAt(FIGHT, -50)).toBe(0);
  });
});

describe('音序器（纯逻辑）', () => {
  it('推进 400ms 会排到 4 个步的音（有音符的才出）', () => {
    const player = new BgmPlayer(FIGHT);
    const notes = player.advance(400);
    // 前 4 步 lead 都有音（69 72 76 72），bass 只有第 0、1 步有
    expect(notes.filter((n) => n.channel === 'lead')).toHaveLength(4);
    expect(notes.filter((n) => n.channel === 'bass').length).toBeGreaterThan(0);
    expect(notes[0]!.atMs).toBe(0);
    expect(notes[0]!.note).toBe(FIGHT.lead[0]);
  });

  it('分段推进与一次推进结果一致（不重不漏）', () => {
    const once = new BgmPlayer(FIGHT);
    const all = once.advance(1000);

    const piecewise = new BgmPlayer(FIGHT);
    const parts = [120, 330, 550].map((ms) => piecewise.advance(ms));
    const flat = parts.flat();

    expect(flat.map((n) => `${n.channel}@${n.atMs}`)).toEqual(all.filter((n) => n.atMs <= 550).map((n) => `${n.channel}@${n.atMs}`));
  });

  it('时间不走就不会重复出发音', () => {
    const player = new BgmPlayer(FIGHT);
    player.advance(500);
    expect(player.advance(500)).toHaveLength(0);
    expect(player.advance(400)).toHaveLength(0); // 往回拨也不补
  });

  it('循环一圈后音高与第一圈相同', () => {
    const player = new BgmPlayer(FIGHT);
    const loopMs = stepDurationMs(FIGHT) * FIGHT.steps;
    const first = player.advance(loopMs);
    const second = player.advance(loopMs * 2);
    expect(second.map((n) => n.note)).toEqual(first.map((n) => n.note));
  });

  it('reset 能回到开头', () => {
    const player = new BgmPlayer(FIGHT);
    player.advance(700);
    player.reset();
    expect(player.positionMs).toBe(0);
    // 第 0 步 lead 和 bass 都有音，所以是两个音都落在 0ms
    expect(player.advance(100).map((n) => n.atMs)).toEqual([0, 0]);
  });
});

describe('播放端', () => {
  it('记账 sink 会记住换曲与音量', () => {
    const sink = new NullBgm();
    sink.setTrack('fight');
    sink.setVolume(0.5);
    sink.setDucked(true);
    expect(sink.trackId).toBe('fight');
    expect(sink.volume).toBe(0.5);
    expect(sink.ducked).toBe(true);
  });

  it('没有 AudioContext 的环境里不抛错', () => {
    const bgm = new WebAudioBgm();
    expect(() => bgm.setTrack('fight')).not.toThrow();
    expect(() => bgm.update(1000)).not.toThrow();
    expect(() => bgm.setVolume(0)).not.toThrow();
    expect(() => bgm.setDucked(true)).not.toThrow();
  });

  it('未知曲目当作静音处理', () => {
    const bgm = new WebAudioBgm();
    expect(() => bgm.setTrack('不存在的曲子')).not.toThrow();
    expect(() => bgm.update(500)).not.toThrow();
  });

  it('曲子定义里的休止符不会被当成 0 号音', () => {
    const track: TrackDef = { ...FIGHT, steps: 4, lead: [60, null, 62, null], bass: [null, null, null, null] };
    const player = new BgmPlayer(track);
    expect(player.advance(400).map((n) => n.note)).toEqual([60, 62]);
  });
});
