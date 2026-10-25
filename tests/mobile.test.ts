import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, computeViewport } from '../src/render/scale';
import {
  HELP_BUTTON,
  HELP_PAGE_COUNT,
  helpPageText,
  hitTestModeItem,
  hitTestOptionRow,
  hitTestPauseItem,
} from '../src/render/screens';
import { MODE_ITEMS } from '../src/ui/flow';
import { PAUSE_ITEMS } from '../src/ui/pause';

describe('铺满模式（手机）', () => {
  it('手机上不取整数倍，画面尽量填满（整数倍会缩成 320×224 蹲在黑边里）', () => {
    const phone = computeViewport(844, 390, 2, undefined, { fill: true });
    const integer = computeViewport(844, 390, 2);
    expect(phone.scale).toBeGreaterThan(integer.scale);
    expect(phone.cssHeight).toBeCloseTo(390, 0); // 高度方向铺满
    expect(phone.scale).toBeLessThan(2); // 但不是整数倍
  });

  it('桌面保持整数倍（像素画锐利），两种模式互不影响', () => {
    const crisp = computeViewport(1280, 720, 1);
    expect(crisp.scale).toBe(Math.floor(Math.min(1280 / LOGICAL_WIDTH, 720 / LOGICAL_HEIGHT)));
    const filled = computeViewport(1280, 720, 1, undefined, { fill: true });
    expect(filled.scale).toBeGreaterThan(crisp.scale);
  });

  it('竖屏铺满时宽度吃满、高度留黑（长宽比不变，不拉伸画面）', () => {
    const vp = computeViewport(390, 844, 2, undefined, { fill: true });
    expect(vp.cssWidth).toBeCloseTo(390, 0);
    expect(vp.cssWidth / vp.cssHeight).toBeCloseTo(LOGICAL_WIDTH / LOGICAL_HEIGHT, 3);
  });
});

describe('菜单点选（触屏）', () => {
  it('模式菜单：点在第 i 行就返回 i', () => {
    for (let i = 0; i < MODE_ITEMS.length; i++) {
      const y = 76 + i * 26; // 与 drawMode 的行距一致
      expect(hitTestModeItem(160, y)).toBe(i);
    }
    expect(hitTestModeItem(160, 10)).toBe(-1);
    expect(hitTestModeItem(2, 76)).toBe(-1); // 左边距之外（留给摇杆）
  });

  it('选项屏：含最后的"按键设置"一行', () => {
    const rows = 8 + 1;
    for (let i = 0; i < rows; i++) {
      expect(hitTestOptionRow(160, 52 + i * 19, rows)).toBe(i);
    }
    expect(hitTestOptionRow(160, 12, rows)).toBe(-1);
  });

  it('暂停菜单：点第 i 项返回 i', () => {
    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      expect(hitTestPauseItem(160, 100 + i * 24, PAUSE_ITEMS.length)).toBe(i);
    }
    expect(hitTestPauseItem(160, 60, PAUSE_ITEMS.length)).toBe(-1);
  });

  it('相邻两行的命中带不重叠（点一个不会误选隔壁）', () => {
    const n = PAUSE_ITEMS.length;
    for (let i = 0; i < n - 1; i++) {
      const a = 100 + i * 24;
      const b = 100 + (i + 1) * 24;
      // 两行之间任意一点只属于其中一行
      for (let y = a; y <= b; y++) {
        const hit = hitTestPauseItem(160, y, n);
        expect(hit === i || hit === i + 1).toBe(true);
      }
    }
  });
});

describe('说明浮层', () => {
  it('页数与文案齐全，越界也能取到合法页（不会因为索引越界画空白）', () => {
    expect(HELP_PAGE_COUNT).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < HELP_PAGE_COUNT; i++) {
      const p = helpPageText(i);
      expect(p.title.length, String(i)).toBeGreaterThan(0);
      expect(p.lines.length, String(i)).toBeGreaterThan(0);
    }
    expect(helpPageText(-5)).toEqual(helpPageText(0));
    expect(helpPageText(99)).toEqual(helpPageText(HELP_PAGE_COUNT - 1));
  });

  it('说明内容覆盖用户要的四件事：目标 / 操作 / 必杀 / 气槽', () => {
    const all = Array.from({ length: HELP_PAGE_COUNT }, (_, i) => helpPageText(i).title + helpPageText(i).lines.join('')).join('');
    for (const kw of ['3 打 3', 'A 轻拳', '↓↘→', '气']) {
      expect(all, kw).toContain(kw);
    }
  });

  it('「怎么玩」按钮在屏幕内', () => {
    expect(HELP_BUTTON.x + HELP_BUTTON.w).toBeLessThanOrEqual(320);
    expect(HELP_BUTTON.y + HELP_BUTTON.h).toBeLessThanOrEqual(224);
  });
});
