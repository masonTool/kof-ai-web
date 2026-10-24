/**
 * 把虚拟按键挂到页面上（触屏点按 / 鼠标点击都能用）。
 *
 * 每个按钮单独处理 pointer 事件并 `setPointerCapture`，所以多指同时按
 * （左手按方向、右手按拳）不会互相顶掉；`pointercancel` 与
 * `lostpointercapture` 都要松键，否则来电/切窗回来会"粘键"一直往前走。
 */
import type { PadButton, VirtualPad } from './virtual-pad';

export interface TouchAction {
  id: string;
  label(): string;
  run(): void;
}

export interface TouchControlsHandle {
  refresh(): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bindHold(button: HTMLButtonElement, pad: VirtualPad, key: PadButton): void {
  const press = (e: PointerEvent): void => {
    e.preventDefault();
    try {
      button.setPointerCapture(e.pointerId);
    } catch {
      // 某些浏览器对已释放的 pointer 会抛，忽略即可
    }
    pad.press(key);
    button.classList.add('pressed');
  };
  const release = (): void => {
    pad.release(key);
    button.classList.remove('pressed');
  };

  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  // 长按不要弹右键菜单 / 别选中文字
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function mountTouchControls(pad: VirtualPad, actions: readonly TouchAction[]): TouchControlsHandle {
  const root = el('div', 'controls');
  root.id = 'controls';

  // 方向键（十字）
  const dpad = el('div', 'pad');
  const dirs: readonly { key: PadButton; label: string; cls: string }[] = [
    { key: 'up', label: '▲', cls: 'up' },
    { key: 'left', label: '◀', cls: 'left' },
    { key: 'right', label: '▶', cls: 'right' },
    { key: 'down', label: '▼', cls: 'dir-down' },
  ];
  for (const d of dirs) {
    const b = el('button', `btn dir ${d.cls}`, d.label);
    b.type = 'button';
    b.setAttribute('aria-label', d.key);
    bindHold(b, pad, d.key);
    dpad.append(b);
  }

  // 攻击键（A B / C D）
  const atk = el('div', 'atk');
  for (const key of ['A', 'B', 'C', 'D'] as const) {
    const b = el('button', `btn key k${key}`, key);
    b.type = 'button';
    b.setAttribute('aria-label', `按键 ${key}`);
    bindHold(b, pad, key);
    atk.append(b);
  }

  // 功能条
  const bar = el('div', 'bar');
  const labels = new Map<string, HTMLButtonElement>();
  for (const action of actions) {
    const b = el('button', 'btn fn', action.label());
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      action.run();
      handle.refresh();
    });
    labels.set(action.id, b);
    bar.append(b);
  }

  root.append(dpad, atk, bar);
  document.body.append(root);

  const handle: TouchControlsHandle = {
    refresh(): void {
      for (const action of actions) {
        const button = labels.get(action.id);
        if (button) button.textContent = action.label();
      }
    },
    dispose(): void {
      pad.releaseAll();
      root.remove();
    },
  };
  return handle;
}
