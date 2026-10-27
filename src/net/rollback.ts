/**
 * 回滚的基础设施：**保存输入 + 重放**，而不是保存状态快照。
 *
 * 为什么不用快照：`World.entities` 里存着 `p1`/`p2` 的**引用**，`structuredClone` 出来的
 * 是纯对象——`Object.assign` 回填会把 Fighter 的方法和引用一起弄丢。重放输入则完全绕开
 * 这个问题：只要 `Match` 是确定性的（项目已有 hash 测试保证），重放就必然得到同一状态。
 *
 * 成本：一次回滚 = 重建 Match + 重放 N 帧。N 通常等于延迟帧数（2~7），60fps 下预算
 * 16.6ms，重放 7 帧完全够。
 */
import type { InputSample } from '../core/input';
import type { CharDef } from '../data/schema';
import { Match, type MatchConfig } from '../game/match';

export interface RollbackFrame {
  /** 这一帧双方实际喂进去的输入 */
  inputs: readonly [InputSample, InputSample];
}

export class RollbackSession {
  /** 每一帧的输入历史（建立时就是"已确认"的帧） */
  private readonly frames: RollbackFrame[] = [];
  private current: Match;

  constructor(
    private readonly charA: CharDef,
    private readonly charB: CharDef,
    private readonly config: Partial<MatchConfig>,
    private readonly seed?: number,
  ) {
    this.current = new Match(charA, charB, config, seed);
  }

  get match(): Match {
    return this.current;
  }

  /** 已推进的帧数（= 下一帧的帧号） */
  get frame(): number {
    return this.frames.length;
  }

  /** 推进一帧并记录输入 */
  step(inputs: readonly [InputSample, InputSample]): void {
    this.frames.push({ inputs });
    this.current.step([inputs[0], inputs[1]]);
  }

  /**
   * 回滚到第 `frame` 帧，并把 `frame` 起的输入替换成新的，然后重放到末尾。
   *
   * 典型用法：收到"第 5 帧对手其实按了 A"的补发输入 → `rewindTo(5, [...])`。
   */
  rewindTo(frame: number, replacement: readonly RollbackFrame[]): void {
    if (frame < 0 || frame > this.frames.length) {
      throw new Error(`回滚帧号越界: ${frame}（已记录 ${this.frames.length} 帧）`);
    }
    // 截断到 frame，再拼接新输入
    this.frames.length = frame;
    for (const f of replacement) this.frames.push(f);

    // 重建 + 重放
    const m = new Match(this.charA, this.charB, this.config, this.seed);
    for (const f of this.frames) m.step([f.inputs[0], f.inputs[1]]);
    this.current = m;
  }

  /**
   * 用"从头重建并重放"的方式算一次 hash，用来验证回滚没有产生分歧。
   *
   * 返回当前状态与"纯重放"状态的 hash 是否一致——不一致说明模拟层不自洽
   * （有隐藏的随机源或跨帧泄漏）。
   */
  verifyDeterministic(): boolean {
    const replay = new Match(this.charA, this.charB, this.config, this.seed);
    for (const f of this.frames) replay.step([f.inputs[0], f.inputs[1]]);
    return replay.hash() === this.current.hash();
  }
}
