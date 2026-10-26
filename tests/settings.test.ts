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
    expect(s.sfxVolume).toBe(1);
    expect(s.bgmVolume).toBe(1);
  });

  it('类型不对回落默认而不是崩', () => {
    const s = sanitize({ roundsToWin: '两局', cpuLevel: 'nightmare', showBoxes: 'yes' });
    expect(s.roundsToWin).toBe(DEFAULT_SETTINGS.roundsToWin);
    expect(s.cpuLevel).toBe(DEFAULT_SETTINGS.cpuLevel);
    expect(s.showBoxes).toBe(DEFAULT_SETTINGS.showBoxes);
  });

  it('合法值原样保留', () => {
    const s = sanitize({ roundsToWin: 3, roundSeconds: 30, cpuLevel: 'hard', sfxVolume: 0.5, bgmVolume: 0.5, showFrameData: true });
    expect(s).toEqual({
      roundsToWin: 3,
      roundSeconds: 30,
      cpuLevel: 'hard',
      sfxVolume: 0.5,
      bgmVolume: 0.5,
      weatherFx: true,
      padCustom: {},
      showFrameData: true,
      fxIntensity: 'full',
      showBoxes: false,
      keyPreset: 0,
      pixelSize: 0.5,
      customKeys: { p1: {}, p2: {} },
    });
  });
});

describe('存盘与读盘', () => {
  it('切换后会自动存盘，新实例能读回来', () => {
    const storage = new FakeStorage();
    const a = new SettingsStore(storage);
    a.cycle('roundsToWin'); // 2 → 3
    a.cycle('sfxVolume'); // 0.25 → 0.5

    const b = new SettingsStore(storage);
    expect(b.settings.roundsToWin).toBe(3);
    expect(b.settings.sfxVolume).toBe(0.5);
    expect(b.settings.bgmVolume).toBe(0.25); // 两条总线互不影响，只动了音效
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
    expect(() => store.cycle('sfxVolume')).not.toThrow();
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
    store.cycle('sfxVolume');
    store.resetDefaults();
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('选项屏的行', () => {
  it('十二行、有标签有值，音量为 0 显示静音', () => {
    const rows = optionRows({ ...DEFAULT_SETTINGS, sfxVolume: 0 });
    expect(rows).toHaveLength(12);
    // 开关类单独断言存在（顺序见 settings.ts，不在这里钉死整张表）
    expect(rows.some((r) => r.key === 'weatherFx')).toBe(true);
    expect(rows.some((r) => r.key === 'fxIntensity')).toBe(true);
    expect(rows.map((r) => r.key)).toEqual([
      'roundsToWin',
      'roundSeconds',
      'cpuLevel',
      'sfxVolume',
      'bgmVolume',
      'showFrameData',
      'weatherFx',
      'fxIntensity',
      'showBoxes',
      'keyPreset',
      'pixelSize',
      'padCustom',
    ]);
    expect(rows[3]!.value).toBe('静音');
    expect(rows[5]!.value).toBe('关');
  });

  it('键盘预设显示名字，切换后跟着变', () => {
    const store = new SettingsStore(null);
    const presetValue = (): string => optionRows(store.settings).find((r) => r.key === 'keyPreset')!.value;
    const first = presetValue();
    store.cycle('keyPreset');
    const second = presetValue();
    expect(first).not.toBe(second);
    expect(store.settings.keyPreset).toBe(1);
    store.cycle('keyPreset');
    expect(store.settings.keyPreset).toBe(0); // 只有两套，转一圈回来
  });

  it('难度用中文显示', () => {
    expect(optionRows({ ...DEFAULT_SETTINGS, cpuLevel: 'hard' })[2]!.value).toBe('困难');
  });
});

describe('像素粒度', () => {
  it('默认最细（1×1），选项文案跟着变', () => {
    expect(DEFAULT_SETTINGS.pixelSize).toBe(0.5);
    const rows = optionRows(DEFAULT_SETTINGS);
    expect(rows.find((r) => r.key === 'pixelSize')!.value).toBe('0.5×0.5');
  });

  it('循环切换 1 → 2 → 4 → 1', () => {
    const store = new SettingsStore(null);
    store.cycle('pixelSize');
    expect(store.settings.pixelSize).toBe(1);
    store.cycle('pixelSize');
    expect(store.settings.pixelSize).toBe(2);
    store.cycle('pixelSize');
    expect(store.settings.pixelSize).toBe(4);
    store.cycle('pixelSize');
    expect(store.settings.pixelSize).toBe(0.5); // 转一圈回来
    store.cycle('pixelSize', -1);
    expect(store.settings.pixelSize).toBe(4); // 反向也能绕
  });

  it('读盘时非法粒度回落默认（用户手改成 9 也不崩）', () => {
    expect(sanitize({ pixelSize: 9 }).pixelSize).toBe(0.5);
    expect(sanitize({ pixelSize: '粗' }).pixelSize).toBe(0.5);
    expect(sanitize({ pixelSize: 4 }).pixelSize).toBe(4);
  });
});

describe('两条音量总线', () => {
  it('音效与音乐分别切换，互不影响', () => {
    const store = new SettingsStore(null);
    const bgm = store.settings.bgmVolume;
    store.cycle('sfxVolume');
    expect(store.settings.sfxVolume).not.toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(store.settings.bgmVolume).toBe(bgm);
  });

  it('老存档只有一个 volume 时迁移到两条总线', () => {
    const s = sanitize({ volume: 0.75 });
    expect(s.sfxVolume).toBe(0.75);
    expect(s.bgmVolume).toBe(0.75);
  });
});

describe('手台位置设置', () => {
  it('合法坐标原样保留，越界/未知控件/非数字一律丢掉', () => {
    const s = sanitize({
      padCustom: {
        A: { x: 0.3, y: 0.7 },
        stick: { x: 1.4, y: 0.2 }, // 越界
        B: { x: 'a', y: 0.5 }, // 非数字
        ZZ: { x: 0.5, y: 0.5 }, // 未知控件
        C: null,
      },
    });
    expect(s.padCustom).toEqual({ A: { x: 0.3, y: 0.7 } });
  });

  it('旧存档没有这个字段时是空对象（= 默认布局）', () => {
    expect(sanitize({}).padCustom).toEqual({});
    expect(sanitize({ padCustom: 'x' }).padCustom).toEqual({});
  });

  it('选项屏按一下就恢复默认（不循环）', () => {
    const store = new SettingsStore(null);
    store.settings.padCustom = { A: { x: 0.2, y: 0.2 } };
    store.cycle('padCustom');
    expect(store.settings.padCustom).toEqual({});
    // 再按还是空，不会变出别的值
    store.cycle('padCustom');
    expect(store.settings.padCustom).toEqual({});
  });
});

describe('演出强度', () => {
  it('默认全特效，可以切成原版克制（读盘也认得）', () => {
    expect(DEFAULT_SETTINGS.fxIntensity).toBe('full');
    expect(sanitize({ fxIntensity: 'retro' }).fxIntensity).toBe('retro');
    // 乱填的值回落成全特效，而不是崩掉
    expect(sanitize({ fxIntensity: 'wild' }).fxIntensity).toBe('full');
  });
});
