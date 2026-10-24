import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SettingsStore,
  optionRows,
  sanitize,
  type StorageLike,
} from '../src/ui/settings';

class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  writes = 0;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    this.map.set(key, value);
  }
}

describe('默认设置', () => {
  it('默认是"能正常打完一场"的配置', () => {
    expect(DEFAULT_SETTINGS.roundsToWin).toBe(2);
    expect(DEFAULT_SETTINGS.roundSeconds).toBe(99);
    expect(DEFAULT_SETTINGS.cpuLevel).toBe('normal');
    expect(DEFAULT_SETTINGS.showFrameData).toBe(false);
    expect(DEFAULT_SETTINGS.showBoxes).toBe(false);
  });
});

describe('消毒（读盘必过）', () => {
  it('空对象回落默认', () => {
    expect(sanitize({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitize('乱码')).toEqual(DEFAULT_SETTINGS);
  });

  it('数值越界会被夹住', () => {
    const s = sanitize({ roundsToWin: 99, roundSeconds: -5, volume: 7 });
    expect(s.roundsToWin).toBe(3);
    expect(s.roundSeconds).toBe(30);
    expect(s.volume).toBe(1);
  });

  it('类型不对回落默认而不是崩', () => {
    const s = sanitize({ roundsToWin: '两局', cpuLevel: 'nightmare', showBoxes: 'yes' });
    expect(s.roundsToWin).toBe(DEFAULT_SETTINGS.roundsToWin);
    expect(s.cpuLevel).toBe(DEFAULT_SETTINGS.cpuLevel);
    expect(s.showBoxes).toBe(DEFAULT_SETTINGS.showBoxes);
  });

  it('合法值原样保留', () => {
    const s = sanitize({ roundsToWin: 3, roundSeconds: 30, cpuLevel: 'hard', volume: 0.5, showFrameData: true });
    expect(s).toEqual({
      roundsToWin: 3,
      roundSeconds: 30,
      cpuLevel: 'hard',
      volume: 0.5,
      showFrameData: true,
      showBoxes: false,
      keyPreset: 0,
    });
  });
});

describe('存盘与读盘', () => {
  it('切换后会自动存盘，新实例能读回来', () => {
    const storage = new FakeStorage();
    const a = new SettingsStore(storage);
    a.cycle('roundsToWin'); // 2 → 3
    a.cycle('volume'); // 0.25 → 0.5

    const b = new SettingsStore(storage);
    expect(b.settings.roundsToWin).toBe(3);
    expect(b.settings.volume).toBe(0.5);
  });

  it('存档是坏 JSON 时回落默认，不抛错', () => {
    const storage = new FakeStorage();
    storage.map.set(SETTINGS_KEY, '{坏掉的');
    expect(() => new SettingsStore(storage)).not.toThrow();
    expect(new SettingsStore(storage).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('没有 storage（隐私模式/node）时也能用', () => {
    const store = new SettingsStore(null);
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    expect(() => store.cycle('volume')).not.toThrow();
    expect(() => store.save()).not.toThrow();
  });
});

describe('循环切换', () => {
  it('左右都能转，转一圈回到原值', () => {
    const store = new SettingsStore(null);
    const times = [store.settings.roundSeconds];
    for (let i = 0; i < 2; i++) {
      store.cycle('roundSeconds');
      times.push(store.settings.roundSeconds);
    }
    expect(times).toEqual([99, 30, 60]);
    store.cycle('roundSeconds', -1);
    expect(store.settings.roundSeconds).toBe(30);
  });

  it('难度按 简单→普通→困难 循环', () => {
    const store = new SettingsStore(null);
    expect(store.settings.cpuLevel).toBe('normal');
    store.cycle('cpuLevel');
    expect(store.settings.cpuLevel).toBe('hard');
    store.cycle('cpuLevel');
    expect(store.settings.cpuLevel).toBe('easy');
    store.cycle('cpuLevel', -1);
    expect(store.settings.cpuLevel).toBe('hard');
  });

  it('开关类直接取反', () => {
    const store = new SettingsStore(null);
    store.cycle('showBoxes');
    expect(store.settings.showBoxes).toBe(true);
    store.cycle('showBoxes');
    expect(store.settings.showBoxes).toBe(false);
  });

  it('重置回默认', () => {
    const store = new SettingsStore(null);
    store.cycle('roundsToWin');
    store.cycle('volume');
    store.resetDefaults();
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('选项屏的行', () => {
  it('七行、有标签有值，音量为 0 显示静音', () => {
    const rows = optionRows({ ...DEFAULT_SETTINGS, volume: 0 });
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.key)).toEqual([
      'roundsToWin',
      'roundSeconds',
      'cpuLevel',
      'volume',
      'showFrameData',
      'showBoxes',
      'keyPreset',
    ]);
    expect(rows[3]!.value).toBe('静音');
    expect(rows[4]!.value).toBe('关');
  });

  it('键盘预设显示名字，切换后跟着变', () => {
    const store = new SettingsStore(null);
    const first = optionRows(store.settings).at(-1)!.value;
    store.cycle('keyPreset');
    const second = optionRows(store.settings).at(-1)!.value;
    expect(first).not.toBe(second);
    expect(store.settings.keyPreset).toBe(1);
    store.cycle('keyPreset');
    expect(store.settings.keyPreset).toBe(0); // 只有两套，转一圈回来
  });

  it('难度用中文显示', () => {
    expect(optionRows({ ...DEFAULT_SETTINGS, cpuLevel: 'hard' })[2]!.value).toBe('困难');
  });
});
