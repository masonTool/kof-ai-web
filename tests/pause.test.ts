import { describe, expect, it } from 'vitest';
import { PAUSE_ITEMS, PauseMenu } from '../src/ui/pause';

describe('暂停菜单', () => {
  it('默认是关着的，show/hide 能开关', () => {
    const menu = new PauseMenu();
    expect(menu.open).toBe(false);
    menu.show();
    expect(menu.open).toBe(true);
    expect(menu.cursor).toBe(0);
    menu.hide();
    expect(menu.open).toBe(false);
  });

  it('toggle 来回切', () => {
    const menu = new PauseMenu();
    expect(menu.toggle()).toBe(true);
    expect(menu.toggle()).toBe(false);
  });

  it('五项：继续 / 重开 / 选项 / 手台位置 / 回标题', () => {
    expect(PAUSE_ITEMS.map((i) => i.id)).toEqual(['resume', 'restart', 'options', 'pad', 'title']);
    expect(PAUSE_ITEMS.every((i) => i.label.length > 0)).toBe(true);
  });

  it('上下移动并环绕', () => {
    const menu = new PauseMenu();
    menu.show();
    menu.move(1);
    expect(menu.cursor).toBe(1);
    menu.move(1);
    menu.move(1);
    expect(menu.cursor).toBe(3);
    menu.move(1);
    expect(menu.cursor).toBe(4);
    menu.move(1);
    expect(menu.cursor).toBe(0); // 环绕
    menu.move(-1);
    expect(menu.cursor).toBe(4);
  });

  it('确认返回当前项并收起菜单', () => {
    const menu = new PauseMenu();
    menu.show();
    expect(menu.confirm()).toBe('resume');
    expect(menu.open).toBe(false);

    menu.show();
    menu.move(1);
    expect(menu.confirm()).toBe('restart');

    menu.show();
    menu.move(4);
    expect(menu.confirm()).toBe('title');
    menu.show();
    menu.move(2);
    expect(menu.confirm()).toBe('options');
  });

  it('重新打开会回到第一项（不会记住上次的选择）', () => {
    const menu = new PauseMenu();
    menu.show();
    menu.move(2);
    menu.hide();
    menu.show();
    expect(menu.cursor).toBe(0);
  });
});
