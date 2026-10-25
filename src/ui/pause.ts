/**
 * 系统菜单：**任何界面**按 B（或手台 B 键）都能叫出来，处理"停下 / 设置 / 回主菜单"。
 *
 * 为什么不是"暂停菜单"：它现在不只在对局里用——选人、选项、结算屏都能叫出来，
 * 语义是"系统级的中断"，所以叫系统菜单。
 *
 * 两条硬规则（用户定的）：
 * 1. **菜单里不能直接开新对局**：没有"重开本场"，想换对战形式必须回主菜单。
 * 2. 非对局界面要有"返回上一级"，否则去掉左上角返回键之后就没法退回了。
 *
 * 纯逻辑（不碰 DOM）：开没开、光标在哪、确认返回哪个动作。
 * 世界冻结由外层负责——"菜单打开时游戏不推进"是 main 的事。
 */

export type MenuAction = 'resume' | 'back' | 'options' | 'pad' | 'title';

export interface MenuItem {
  id: MenuAction;
  label: string;
}

/**
 * 菜单项随场景变化。
 *
 * - `fight`：对局中（要推进世界的那种界面）——只给"继续 / 选项 / 手台 / 回主菜单"
 * - `menu`：其余界面——多一个"返回上一级"，顶替被去掉的左上角返回键
 */
export type MenuContext = 'fight' | 'menu';

export const FIGHT_MENU_ITEMS: readonly MenuItem[] = [
  { id: 'resume', label: '继续' },
  { id: 'options', label: '选项' },
  { id: 'pad', label: '手台位置' },
  { id: 'title', label: '返回主菜单' },
];

export const MENU_MENU_ITEMS: readonly MenuItem[] = [
  { id: 'resume', label: '继续' },
  { id: 'back', label: '返回上一级' },
  { id: 'options', label: '选项' },
  { id: 'pad', label: '手台位置' },
  { id: 'title', label: '返回主菜单' },
];

export function menuItems(ctx: MenuContext): readonly MenuItem[] {
  return ctx === 'fight' ? FIGHT_MENU_ITEMS : MENU_MENU_ITEMS;
}

export class SystemMenu {
  open = false;
  cursor = 0;
  context: MenuContext = 'fight';

  get items(): readonly MenuItem[] {
    return menuItems(this.context);
  }

  show(ctx: MenuContext): void {
    this.open = true;
    this.context = ctx;
    this.cursor = 0;
  }

  hide(): void {
    this.open = false;
    this.cursor = 0;
  }

  toggle(ctx: MenuContext): boolean {
    if (this.open) this.hide();
    else this.show(ctx);
    return this.open;
  }

  /** 上下移动（环绕） */
  move(delta: number): void {
    const size = this.items.length;
    this.cursor = ((this.cursor + delta) % size + size) % size;
  }

  /** 确认当前项并收起菜单 */
  confirm(): MenuAction {
    const item = this.items[this.cursor] ?? this.items[0]!;
    this.hide();
    return item.id;
  }
}

/** 兼容旧引用：菜单类改名了，但 main 里只有一处构造 */
export { SystemMenu as PauseMenu };
