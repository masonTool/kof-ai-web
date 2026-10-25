/**
 * 虚拟按键（触屏 / 鼠标）的状态：只做"哪些键被按住"，不碰 DOM。
 *
 * 和键盘一样产出 `InputSample`，上层 OR 起来即可——这样触屏和键盘可以同时用，
 * 也不用给模拟层再加一套输入路径。
 *
 * 一个坑：鼠标单击是"按下+抬起"几乎同一瞬间，如果两次都发生在两帧之间，
 * 逐帧采样永远看不到这个键。所以按下但还没被采样过的键，在抬起时要**留一帧**。
 */
import { Btn, type InputSample } from '../core/input';

export const PAD_BUTTONS = ['left', 'right', 'up', 'down', 'A', 'B', 'C', 'D'] as const;
/** 四个方向键（摇杆管这一段，攻击键各管各的） */
export const DIRECTION_BUTTONS = ['left', 'right', 'up', 'down'] as const;
export type DirectionButton = (typeof DIRECTION_BUTTONS)[number];
export type PadButton = (typeof PAD_BUTTONS)[number];

const BITS: Record<PadButton, number> = {
  left: Btn.Left,
  right: Btn.Right,
  up: Btn.Up,
  down: Btn.Down,
  A: Btn.A,
  B: Btn.B,
  C: Btn.C,
  D: Btn.D,
};

export class VirtualPad {
  private readonly down = new Set<PadButton>();
  /** 按下后还没被采样过的键 */
  private readonly fresh = new Set<PadButton>();
  /** 抬起时还没被采样过、需要补一帧的键 */
  private readonly latched = new Set<PadButton>();

  press(b: PadButton): void {
    this.down.add(b);
    this.fresh.add(b);
  }

  release(b: PadButton): void {
    if (this.fresh.has(b)) {
      // 这一帧还没轮到采样，抬起太快 → 留一帧，否则单击会丢
      this.down.delete(b);
      this.latched.add(b);
      return;
    }
    this.down.delete(b);
  }

  /**
   * 摇杆专用：**原子地**设置四个方向键的状态。
   *
   * 为什么不直接 press/release：摇杆每帧都可能给出一组新方向，
   * 调用方不该关心"上一帧哪个方向开着"。这里做差量，只有变化的方向才走 press/release，
   * 这样"快速右→左"的一瞬也不会因为复用同一个键而丢输入。
   */
  setDirections(next: readonly PadButton[]): void {
    const want = new Set(next);
    for (const b of DIRECTION_BUTTONS) {
      const has = this.down.has(b);
      if (want.has(b) && !has) this.press(b);
      else if (!want.has(b) && has) this.release(b);
    }
  }

  releaseAll(): void {
    this.down.clear();
    this.fresh.clear();
    this.latched.clear();
  }

  isDown(b: PadButton): boolean {
    return this.down.has(b);
  }

  get held(): number {
    let held = 0;
    for (const b of this.down) held |= BITS[b];
    for (const b of this.latched) held |= BITS[b];
    return held >>> 0;
  }

  /** 当前按住（含补帧）的输入 */
  get sample(): InputSample {
    return { held: this.held };
  }

  /** 每个逻辑帧调一次：取走本帧输入，并结束"补帧"状态 */
  sampleFrame(): InputSample {
    const sample: InputSample = { held: this.held };
    this.fresh.clear();
    this.latched.clear();
    return sample;
  }

  /** 当前按住的键（UI 高亮 / 调试用） */
  snapshot(): PadButton[] {
    return [...new Set([...this.down, ...this.latched])];
  }
}
