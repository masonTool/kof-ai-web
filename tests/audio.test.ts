import { describe, expect, it } from 'vitest';
import { NullSink, SFX, WebAudioSink, sfxForWorldEvent, voiceForWorldEvent, type SfxName } from '../src/audio/sfx';

describe('音效表', () => {
  it('每个音效参数都合法（频率正、时长正、音量 0~1）', () => {
    for (const [name, spec] of Object.entries(SFX)) {
      expect(spec.ms, name).toBeGreaterThan(10);
      expect(spec.gain, name).toBeGreaterThan(0);
      expect(spec.gain, name).toBeLessThanOrEqual(1);
      expect(spec.from, name).toBeGreaterThan(20);
      expect(spec.to, name).toBeGreaterThan(20);
      if (spec.noise !== undefined) {
        expect(spec.noise, name).toBeGreaterThanOrEqual(0);
        expect(spec.noise, name).toBeLessThanOrEqual(1);
      }
    }
  });

  it('重的打击音更长更响', () => {
    expect(SFX.hitHeavy.ms).toBeGreaterThan(SFX.hitLight.ms);
    expect(SFX.hitHeavy.gain).toBeGreaterThan(SFX.hitLight.gain);
  });
});

describe('事件 → 音效', () => {
  it('普通命中与重击区分开', () => {
    expect(sfxForWorldEvent('hit', { damage: 24 })).toBe('hitLight');
    expect(sfxForWorldEvent('hit', { damage: 80 })).toBe('hitHeavy');
  });

  it('防御 / 崩防 / KO / 气绝都有声音', () => {
    expect(sfxForWorldEvent('guard')).toBe('guard');
    expect(sfxForWorldEvent('guardcrush')).toBe('guardCrush');
    expect(sfxForWorldEvent('ko')).toBe('ko');
    expect(sfxForWorldEvent('dizzy')).toBe('ko');
  });

  it('不认识的事件不出声', () => {
    expect(sfxForWorldEvent('开始')).toBeNull();
    expect(sfxForWorldEvent('')).toBeNull();
  });
});

describe('播放端', () => {
  it('记账 sink 按顺序记下播过的音效', () => {
    const sink = new NullSink();
    const list: SfxName[] = ['menu', 'confirm', 'hitLight'];
    for (const n of list) sink.play(n);
    expect(sink.played).toEqual(list);
    sink.clear();
    expect(sink.played).toEqual([]);
  });

  it('没有 AudioContext 的环境（node）里播放不抛错', () => {
    const sink = new WebAudioSink();
    expect(() => sink.play('hitHeavy')).not.toThrow();
    expect(() => sink.resume()).not.toThrow();
  });
});

describe('人声', () => {
  it('只在值得喊的时刻出声（重击/反击/超必杀/KO）', () => {
    expect(voiceForWorldEvent('superstart', {})).toBe('voiceSuper');
    expect(voiceForWorldEvent('superhit', {})).toBe('voiceHit');
    expect(voiceForWorldEvent('ko', {})).toBe('voiceKo');
    expect(voiceForWorldEvent('hit', { damage: 80 })).toBe('voiceHit');
    expect(voiceForWorldEvent('hit', { damage: 10, counter: true })).toBe('voiceHit');
  });

  it('轻击不喊、无关事件不喊（否则连段里一直在叫）', () => {
    expect(voiceForWorldEvent('hit', { damage: 10 })).toBeNull();
    expect(voiceForWorldEvent('guard', {})).toBeNull();
    expect(voiceForWorldEvent('proj', {})).toBeNull();
  });
});
