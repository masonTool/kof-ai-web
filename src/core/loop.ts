/**
 * 固定步长时钟：把真实时间（毫秒）换算成"该跑几个逻辑帧"。
 *
 * 逻辑与渲染解耦：模拟永远按 1/60 秒推进，渲染每帧照画面实际状态画。
 * 累加器与"单帧最多补几帧"都在这里，避免切后台回来后一次补几百帧把游戏卡死。
 */
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const MAX_STEPS_PER_FRAME = 6;

/** 累加器是浮点，1/60 秒除不尽；比较时留一点余量，否则会少跑一帧 */
const EPSILON_MS = 1e-9;

export class FixedStepper {
  private acc = 0;
  private totalSteps = 0;

  constructor(
    private readonly stepMs: number = TICK_MS,
    private readonly maxSteps: number = MAX_STEPS_PER_FRAME,
  ) {}

  /**
   * 喂入经过的真实时间，回调每个应跑的逻辑帧。
   * 返回本次实际跑的帧数。长时间卡顿会丢帧（累加器封顶），这是刻意的。
   */
  advance(deltaMs: number, run: (stepIndex: number) => void): number {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;

    this.acc = Math.min(this.acc + deltaMs, this.stepMs * this.maxSteps);

    let steps = 0;
    while (steps < this.maxSteps && this.acc + EPSILON_MS >= this.stepMs) {
      run(steps);
      steps++;
      this.acc -= this.stepMs;
    }
    if (this.acc < 0) this.acc = 0; // 浮点欠账抹平，别留下负数
    if (steps >= this.maxSteps) this.acc = 0; // 追不上的部分直接丢弃，别累积成雪球

    this.totalSteps += steps;
    return steps;
  }

  get leftoverMs(): number {
    return this.acc;
  }

  get steps(): number {
    return this.totalSteps;
  }

  reset(): void {
    this.acc = 0;
    this.totalSteps = 0;
  }
}

export interface AnimationLoopCallbacks {
  step(): void;
  /** alpha = 距离下一个逻辑帧的进度 [0,1)，留给将来的插值渲染 */
  render(alpha: number): void;
}

/**
 * 把 FixedStepper 接到 requestAnimationFrame 上（只在浏览器里调用；node 测试不碰这里）。
 * 返回停止函数。
 */
export function startAnimationLoop(callbacks: AnimationLoopCallbacks, stepper = new FixedStepper()): () => void {
  let last = performance.now();
  let running = true;
  let handle = 0;

  const frame = (now: number): void => {
    if (!running) return;
    const delta = now - last;
    last = now;
    stepper.advance(delta, () => callbacks.step());
    callbacks.render(Math.min(stepper.leftoverMs / TICK_MS, 0.999));
    handle = requestAnimationFrame(frame);
  };

  handle = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(handle);
  };
}
