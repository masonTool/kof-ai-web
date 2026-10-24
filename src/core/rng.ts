/**
 * 确定性随机数（xorshift32）。
 *
 * 为什么不用 Math.random：格斗游戏的每个 tick 都要求"同输入 → 同结果"，
 * 否则回放、AI 复现、无头测试全部失效。所有随机性（粒子抖动、AI 决策）都必须走这里，
 * 且 seed 必须存在世界状态里（能序列化、能进哈希）。
 */
export class Rng {
  private state: number;

  constructor(seed: number = 0x9e3779b9) {
    // 0 是 xorshift 的不动点，必须避开
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** 32 位无符号随机数 */
  nextU32(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x;
  }

  /** [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** [0, maxExclusive) 的整数 */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return this.nextU32() % maxExclusive;
  }

  /** [min, max) 的整数 */
  range(min: number, maxExclusive: number): number {
    return min + this.int(maxExclusive - min);
  }

  /** 浮点区间 [min, max) */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 序列化用（进世界哈希 / 存档） */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = (state >>> 0) || 0x9e3779b9;
  }
}
