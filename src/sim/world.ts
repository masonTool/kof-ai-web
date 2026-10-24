/**
 * 世界：确定性模拟的唯一容器。
 *
 * 三条铁律（破坏任何一条，回放/测试/AI 复现都会歪）：
 * 1. 一个 tick = 一帧 = 1/60 秒，时间单位一律是整数帧，禁止 deltaTime 进入玩法；
 * 2. 推进顺序固定：实体按 `id` 升序 → 物理 → 判定 → 结算（本条只定骨架，后续在实体/系统中填）；
 * 3. 一切随机性走 `world.rng`，一切"按下/松开"由 world 统一算边沿。
 *
 * 本文件不许 import DOM/Canvas：它要能在 node 里 headless 跑。
 */
import { Hasher } from '../core/hash';
import type { InputSample, InputState } from '../core/input';
import { edges } from '../core/input';
import { Rng } from '../core/rng';

export const TICK_RATE = 60;

/** 世界事件：给渲染/音频/UI 消费，不参与模拟（不允许多次读同一帧就改变行为） */
export interface WorldEvent {
  readonly type: string;
  readonly data: Readonly<Record<string, number | string | boolean>>;
}

export interface Entity {
  /** 由 World 分配，等于添加顺序，决定推进顺序 */
  id: number;
  /** 每 tick 调用一次 */
  step(world: World, input: InputState): void;
  /** 把自身状态压进哈希（用于确定性断言） */
  hash(h: Hasher): void;
}

const EMPTY: InputSample = { held: 0 };

export class World {
  /** 已推进的帧数（第 0 帧 = 开局那一帧之前） */
  tick = 0;
  readonly rng: Rng;
  readonly entities: Entity[] = [];
  /** 本帧产生的事件，`step()` 开头清空 */
  events: WorldEvent[] = [];

  private prevHeld: number[] = [];
  private nextId = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  add<T extends Entity>(entity: T): T {
    entity.id = this.nextId++;
    this.entities.push(entity);
    this.prevHeld.push(0);
    return entity;
  }

  emit(type: string, data: Record<string, number | string | boolean> = {}): void {
    this.events.push({ type, data });
  }

  /**
   * 推进一帧。`inputs[i]` 对应 `entities[i]`，缺省视为无输入（AI/观战用）。
   * 返回本帧事件（同一份引用，下一帧会被清空）。
   */
  step(inputs: readonly InputSample[] = []): readonly WorldEvent[] {
    this.events.length = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const held = (inputs[i] ?? EMPTY).held >>> 0;
      const prev = this.prevHeld[i]!;
      this.prevHeld[i] = held;
      this.entities[i]!.step(this, edges(held, prev));
    }
    this.tick++;
    return this.events;
  }

  /** 状态指纹：tick + rng + 输入历史 + 每个实体（按 id 升序） */
  hash(): string {
    const h = new Hasher();
    h.u32(this.tick).u32(this.rng.getState());
    for (const held of this.prevHeld) h.u32(held);
    for (const e of this.entities) {
      h.u32(e.id);
      e.hash(h);
    }
    return h.hex();
  }
}
