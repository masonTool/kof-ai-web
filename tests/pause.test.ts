import { describe, expect, it } from 'vitest';
import { FIGHT_MENU_ITEMS, MENU_MENU_ITEMS, SystemMenu, menuItems } from '../src/ui/pause';

/**
 * 系统菜单的两条硬规则（用户定的）：
 * 1. 菜单里不能直接开新对局（没有"重开"），要换对战形式必须回主菜单
 * 2. 菜单界面要有"返回上一级"，因为左上角返回键已经去掉了
 */
describe('系统菜单', () => {
  it('对局中没有"重开本场"：想换对战必须回主菜单', () => {
    const items = menuItems('fight');
    expect(items.map((i) => i.id)).toEqual(['resume', 'options', 'pad', 'title']);
    expect(items.some((i) => /重开|再来/.test(i.label))).toBe(false);
  });

  it('菜单界面多一个"返回上一级"（顶替被去掉的返回键）', () => {
    expect(menuItems('menu').map((i) => i.id)).toEqual(['resume', 'back', 'options', 'pad', 'title']);
    expect(MENU_MENU_ITEMS.length).toBe(FIGHT_MENU_ITEMS.length + 1);
  });

  it('默认关着；show 时按场景选项、光标回到第一项', () => {
    const menu = new SystemMenu();
    expect(menu.open).toBe(false);
    menu.show('menu');
    expect(menu.open).toBe(true);
    expect(menu.items).toBe(MENU_MENU_ITEMS);
    menu.move(2);
    menu.hide();
    menu.show('fight');
    expect(menu.cursor).toBe(0); // 重新打开不记住上次
    expect(menu.items).toBe(FIGHT_MENU_ITEMS);
  });

  it('上下移动并环绕', () => {
    const menu = new SystemMenu();
    menu.show('fight');
    menu.move(1);
    expect(menu.cursor).toBe(1);
    menu.move(3);
    expect(menu.cursor).toBe(0); // 4 项环绕
    menu.move(-1);
    expect(menu.cursor).toBe(3);
  });

  it('确认返回当前项并收起菜单', () => {
    const menu = new SystemMenu();
    menu.show('fight');
    expect(menu.confirm()).toBe('resume');
    expect(menu.open).toBe(false);

    menu.show('flight' as never);
    menu.show('menu');
    menu.move(1);
    expect(menu.confirm()).toBe('back');

    menu.show('menu');
    menu.move(4);
    expect(menu.confirm()).toBe('title');
  });

  it('toggle 打开/关闭，返回当前状态', () => {
    const menu = new SystemMenu();
    expect(menu.toggle('fight')).toBe(true);
    expect(menu.toggle('fight')).toBe(false);
  });
});
