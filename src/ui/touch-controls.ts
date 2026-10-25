/**
 * 手机手台：左虚拟摇杆 + 右菱形四键 + 底部功能条。
 *
 * 三条硬约束（都是手机上踩过的）：
 * 1. **多点触控**：每个按钮各自 `setPointerCapture`，摇杆单独跟踪自己的 pointerId，
 *    所以"按住 ← 同时点 A"不会互相顶掉；`pointercancel` / `lostpointercapture` 也要松键，
 *    否则来电或切窗回来会"粘键"一直往前走。
 * 2. **尺寸按屏幕短边取比例**：见 `pad-layout.ts`，同一个 px 在手机和平板上手感差一倍。
 * 3. **按下即命中**：摇杆不要求先按在圆心，落在底盘内就以触点为起点。
 */
import { dirButtons, Joystick } from './joystick';
import { padLayout, type PadInsets } from './pad-layout';
import type { VirtualPad } from './virtual-pad';

export interface TouchAction {
  id: string;
  label(): string;
  run(): void;
}

export interface TouchControlsHandle {
  refresh(): void;
  /** 底部功能条只在能用到的时候显示（菜单里藏起来） */
  setBarVisible(visible: boolean): void;
  /** 窗口尺寸 / 安全区变化时重新摆位（比例布局，不是固定 px） */
  layout(width: number, height: number, insets: PadInsets): void;
  dispose(): void;
}

/** 按下键的触感反馈；不支持（桌面 / 老 iOS）就静默跳过 */
const VIBRATE_MS = 8;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buzz(): void {
  try {
    navigator.vibrate?.(VIBRATE_MS);
  } catch {
    // 某些浏览器在无用户手势时抛异常，忽略
  }
}

export interface TouchControlsOptions {
  /** 第一次按下手台时通知外面（解锁音频 / 进全屏）——手台在画布之外，画布的 pointerdown 收不到 */
  onFirstInput?: () => void;
}

export function mountTouchControls(
  pad: VirtualPad,
  actions: readonly TouchAction[],
  opts: TouchControlsOptions = {},
): TouchControlsHandle {
  let firstDone = false;
  const firstInput = (): void => {
    if (firstDone) return;
    firstDone = true;
    opts.onFirstInput?.();
  };

  const root = el('div', 'controls');
  root.id = 'controls';

  // ---------- 左：摇杆 ----------
  const stick = el('div', 'stick');
  const knob = el('div', 'knob');
  stick.append(knob);
  const joystick = new Joystick();
  let stickPointer: number | null = null;

  const applyStick = (px: number, py: number): void => {
    pad.setDirections(dirButtons(joystick.moveTo(px, py)));
    const k = joystick.knob;
    knob.style.transform = `translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px)`;
  };

  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    firstInput();
    if (stickPointer !== null) return; // 摇杆只认第一根手指
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    stick.classList.add('pressed');
    const rect = stick.getBoundingClientRect();
    joystick.setCenter(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width / 2);
    applyStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => {
    if (stickPointer !== e.pointerId) return;
    e.preventDefault();
    applyStick(e.clientX, e.clientY);
  });
  const stickUp = (e: PointerEvent): void => {
    if (stickPointer !== e.pointerId) return;
    stickPointer = null;
    joystick.release();
    pad.setDirections([]);
    stick.classList.remove('pressed');
    knob.style.transform = 'translate(0px, 0px)';
  };
  stick.addEventListener('pointerup', stickUp);
  stick.addEventListener('pointercancel', stickUp);
  stick.addEventListener('lostpointercapture', stickUp);
  stick.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- 右：菱形四键 ----------
  const atk = el('div', 'atk');
  const keys = new Map<'A' | 'B' | 'C' | 'D', HTMLButtonElement>();
  for (const key of ['A', 'B', 'C', 'D'] as const) {
    const b = el('button', `btn key k${key}`, key);
    b.type = 'button';
    b.setAttribute('aria-label', `按键 ${key}`);
    const press = (e: PointerEvent): void => {
      e.preventDefault();
      firstInput();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // 指针已经释放时某些浏览器会抛，忽略
      }
      pad.press(key);
      b.classList.add('pressed');
      buzz();
    };
    const release = (): void => {
      pad.release(key);
      b.classList.remove('pressed');
    };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    keys.set(key, b);
    atk.append(b);
  }

  // ---------- 底：功能条 ----------
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

  root.append(stick, atk, bar);
  document.body.append(root);

  const place = (node: HTMLElement, cx: number, cy: number, r: number): void => {
    node.style.left = `${(cx - r).toFixed(1)}px`;
    node.style.top = `${(cy - r).toFixed(1)}px`;
    node.style.width = `${(r * 2).toFixed(1)}px`;
    node.style.height = `${(r * 2).toFixed(1)}px`;
  };

  const handle: TouchControlsHandle = {
    refresh(): void {
      for (const action of actions) {
        const button = labels.get(action.id);
        if (button) button.textContent = action.label();
      }
    },
    setBarVisible(visible: boolean): void {
      bar.style.display = visible ? 'flex' : 'none';
    },
    layout(width: number, height: number, insets: PadInsets): void {
      const l = padLayout(width, height, insets);
      place(stick, l.stick.cx, l.stick.cy, l.stick.r);
      for (const [key, node] of keys) {
        const c = l.buttons[key];
        place(node, c.cx, c.cy, c.r);
      }
      bar.style.left = `${l.bar.x.toFixed(1)}px`;
      bar.style.top = `${l.bar.y.toFixed(1)}px`;
      bar.style.width = `${l.bar.w.toFixed(1)}px`;
      bar.style.height = `${l.bar.h.toFixed(1)}px`;
      // 字号也跟着短边走，否则平板上的字小得看不见
      const fontPx = Math.max(9, Math.round(l.unit * 0.024));
      for (const node of keys.values()) node.style.fontSize = `${fontPx}px`;
      bar.style.fontSize = `${Math.max(8, Math.round(l.unit * 0.017))}px`;
    },
    dispose(): void {
      pad.releaseAll();
      root.remove();
    },
  };
  return handle;
}
