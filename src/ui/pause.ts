/**
 * 暂停菜单：继续 / 重开本场 / 回到标题。
 *
 * 纯逻辑（不碰 DOM）：开没开、光标在哪、确认返回哪个动作。
 * 战斗冻结由外层负责——"暂停时世界不推进"是 main 的事，这里只表达状态。
 */

export type PauseAction = 'resume' | 'restart' | 'options' | 'title';

export interface PauseItem {
  id: PauseAction;
  label: string;
}

export const PAUSE_ITEMS: readonly PauseItem[] = [
  { id: 'resume', label: '继续' },
  { id: 'restart', label: '重开本场' },
  { id: 'options', label: '选项' },
  { id: 'title', label: '回到标题' },
];

export class PauseMenu {
  open = false;
  cursor = 0;

  get items(): readonly PauseItem[] {
    return PAUSE_ITEMS;
  }

  show(): void {
    this.open = true;
    this.cursor = 0;
  }

  hide(): void {
    this.open = false;
    this.cursor = 0;
  }

  toggle(): boolean {
    if (this.open) this.hide();
    else this.show();
    return this.open;
  }

  /** 上下移动（环绕） */
  move(delta: number): void {
    const size = PAUSE_ITEMS.length;
    this.cursor = ((this.cursor + delta) % size + size) % size;
  }

  /** 确认当前项并收起菜单 */
  confirm(): PauseAction {
    const item = PAUSE_ITEMS[this.cursor] ?? PAUSE_ITEMS[0]!;
    this.hide();
    return item.id;
  }
}
