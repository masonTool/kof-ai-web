import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { KeyBindMenu } from '../src/ui/keybind';
import {
  DEFAULT_SETTINGS,
  KEY_ACTIONS,
  SettingsStore,
  keyLabelFor,
  keymapFor,
  prettyKey,
  sanitize,
  type StorageLike,
} from '../src/ui/settings';

class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe('键位映射', () => {
  it('没自定义时等于预设', () => {
    const map = keymapFor(DEFAULT_SETTINGS, 1);
    expect(map['ArrowLeft']).toBe(Btn.Left);
    expect(map['KeyJ']).toBe(Btn.A);
  });

  it('自定义会覆盖预设，且旧键不再生效（不会一个动作两个键）', () => {
    const settings = sanitize({ customKeys: { p1: { a: 'KeyZ' } } });
    const map = keymapFor(settings, 1);
    expect(map['KeyZ']).toBe(Btn.A);
    expect(map['KeyJ']).toBeUndefined();
    // 其它键不受影响
    expect(map['KeyK']).toBe(Btn.B);
  });

  it('左右两侧互不影响', () => {
    const settings = sanitize({ customKeys: { p2: { a: 'KeyN' } } });
    expect(keymapFor(settings, 2)['KeyN']).toBe(Btn.A);
    expect(keymapFor(settings, 1)['KeyJ']).toBe(Btn.A);
  });

  it('显示名：字母取字母，方向键变箭头，空格/回车中文', () => {
    expect(prettyKey('KeyJ')).toBe('J');
    expect(prettyKey('ArrowUp')).toBe('↑');
    expect(prettyKey('Space')).toBe('空格');
    expect(prettyKey('Digit1')).toBe('1');
  });

  it('keyLabelFor 给出当前绑定的键名', () => {
    const settings = sanitize({ customKeys: { p1: { a: 'KeyZ' } } });
    expect(keyLabelFor(settings, 1, 'a')).toBe('Z');
    expect(keyLabelFor(settings, 1, 'b')).toBe('K');
  });
});

describe('设置里的自定义键位', () => {
  it('setKey 会写进设置并存盘', () => {
    const storage = new FakeStorage();
    const store = new SettingsStore(storage);
    store.setKey(1, 'a', 'KeyZ');
    expect(store.settings.customKeys.p1.a).toBe('KeyZ');
    expect(new SettingsStore(storage).settings.customKeys.p1.a).toBe('KeyZ');
  });

  it('同一个键绑到新动作时，会把旧动作上的它解绑', () => {
    const store = new SettingsStore(null);
    store.setKey(1, 'a', 'KeyZ');
    store.setKey(1, 'b', 'KeyZ'); // 同一个键给 B
    expect(store.settings.customKeys.p1.a).toBeUndefined();
    expect(store.settings.customKeys.p1.b).toBe('KeyZ');
  });

  it('非法键名被拒绝（不会写脏数据）', () => {
    const store = new SettingsStore(null);
    store.setKey(1, 'a', '这不是键');
    expect(store.settings.customKeys.p1.a).toBeUndefined();
  });

  it('clearKeys 恢复预设', () => {
    const store = new SettingsStore(null);
    store.setKey(1, 'a', 'KeyZ');
    store.clearKeys(1);
    expect(store.settings.customKeys.p1).toEqual({});
  });

  it('读盘时脏的自定义键位会被丢掉', () => {
    const s = sanitize({ customKeys: { p1: { a: '哈哈', b: 'KeyK', 乱码: 'KeyX' }, p3: {} } });
    expect(s.customKeys.p1.a).toBeUndefined();
    expect(s.customKeys.p1.b).toBe('KeyK');
    expect(Object.keys(s.customKeys.p1)).toEqual(['b']);
  });
});

describe('重绑菜单', () => {
  it('上下移动并环绕，捕获时不移动', () => {
    const menu = new KeyBindMenu();
    menu.show();
    expect(menu.row).toBe(0);
    menu.move(1);
    expect(menu.row).toBe(1);
    menu.move(-1);
    menu.move(-1);
    expect(menu.row).toBe(KEY_ACTIONS.length - 1);

    menu.beginCapture();
    menu.move(1);
    expect(menu.row).toBe(KEY_ACTIONS.length - 1); // 等按键时不动
    menu.cancel();
    menu.move(1);
    expect(menu.row).toBe(0);
  });

  it('左右切换 P1/P2', () => {
    const menu = new KeyBindMenu();
    menu.show(1);
    menu.toggleSide();
    expect(menu.side).toBe(2);
    menu.toggleSide();
    expect(menu.side).toBe(1);
  });

  it('捕获后写入并自动跳到下一个动作', () => {
    const menu = new KeyBindMenu();
    menu.show(1);
    const bound: [number, string, string][] = [];
    menu.beginCapture();
    const ok = menu.apply('KeyZ', (side, action, code) => bound.push([side, action, code]));
    expect(ok).toBe(true);
    expect(bound).toEqual([[1, 'up', 'KeyZ']]);
    expect(menu.capturing).toBe(false);
    expect(menu.row).toBe(1);
  });

  it('Esc 只取消、不绑定', () => {
    const menu = new KeyBindMenu();
    menu.show(2);
    const bound: unknown[] = [];
    menu.beginCapture();
    expect(menu.apply('Escape', (...args) => bound.push(args))).toBe(false);
    expect(bound).toHaveLength(0);
    expect(menu.capturing).toBe(false);
  });

  it('没在捕获时 apply 不生效', () => {
    const menu = new KeyBindMenu();
    menu.show();
    expect(menu.apply('KeyZ', () => undefined)).toBe(false);
  });
});
