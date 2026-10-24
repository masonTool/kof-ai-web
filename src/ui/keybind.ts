/**
 * 按键重绑菜单：选玩家 → 选动作 → 按一个键 → 写入设置。
 *
 * 纯逻辑（不碰 DOM）：`capturing` 为真时，由外层把 `event.code` 递进 `apply()`。
 * 这样"按 Esc 取消""同一个键不能绑两个动作"这类规则都能在 node 里断言。
 */
import { KEY_ACTIONS, type KeyAction } from './settings';

export class KeyBindMenu {
  /** 当前在改哪个玩家 */
  side: 1 | 2 = 1;
  /** 当前选中的动作下标 */
  row = 0;
  /** 是否正在等按键 */
  capturing = false;

  get actions(): typeof KEY_ACTIONS {
    return KEY_ACTIONS;
  }

  get action(): KeyAction {
    return KEY_ACTIONS[this.row]!.id;
  }

  show(side: 1 | 2 = 1): void {
    this.side = side;
    this.row = 0;
    this.capturing = false;
  }

  move(delta: number): void {
    if (this.capturing) return; // 等按键时不要动光标
    const size = KEY_ACTIONS.length;
    this.row = ((this.row + delta) % size + size) % size;
  }

  toggleSide(): void {
    if (this.capturing) return;
    this.side = this.side === 1 ? 2 : 1;
  }

  beginCapture(): void {
    this.capturing = true;
  }

  cancel(): void {
    this.capturing = false;
  }

  /**
   * 收到一个按键码：写进设置并结束捕获。
   * `Escape` 留给"取消"，不接受绑定（否则退不出这个界面）。
   */
  apply(code: string, onBind: (side: 1 | 2, action: KeyAction, code: string) => void): boolean {
    if (!this.capturing) return false;
    if (code === 'Escape') {
      this.capturing = false;
      return false;
    }
    onBind(this.side, this.action, code);
    this.capturing = false;
    // 绑完自动跳到下一个动作，连着重绑不用一直按方向键
    this.row = (this.row + 1) % KEY_ACTIONS.length;
    return true;
  }
}
