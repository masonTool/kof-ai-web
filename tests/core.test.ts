import { describe, expect, it } from 'vitest';
import { Btn, axisX, makeInput, type InputSample, type InputState } from '../src/core/input';
import { Hasher } from '../src/core/hash';
import { Rng } from '../src/core/rng';
import { FixedStepper, TICK_MS } from '../src/core/loop';
import { World, type Entity } from '../src/sim/world';

/** 测试用实体：只依赖输入与 world.rng，用来验证"同输入 → 同状态" */
class TestActor implements Entity {
  id = -1;
  x = 0;
  vx = 0;
  hp = 100;
  pressed = 0;
  hits = 0;

  step(world: World, input: InputState): void {
    const dir = axisX(input.held);
    this.vx = dir * 2;
    this.x += this.vx;
    this.pressed = input.pressed;
    if (input.pressed & Btn.C) {
      this.hp -= world.rng.int(5) + 1;
      this.hits++;
      world.emit('hit', { x: this.x, hp: this.hp });
    }
  }

  hash(h: Hasher): void {
    h.f64(this.x).f64(this.vx).i32(this.hp).u32(this.pressed).u32(this.hits);
  }
}

/** 确定性脚本输入：与时间无关，只由帧号决定 */
function scripted(frame: number): InputSample {
  let held = 0;
  held |= frame % 120 < 60 ? Btn.Right : Btn.Left;
  if (frame % 37 === 0) held |= Btn.C;
  if (frame % 91 === 0) held |= Btn.A;
  return makeInput(held);
}

interface RunResult {
  hash: string;
  tick: number;
  events: string[];
  actor: { x: number; hp: number; hits: number };
}

function runFrames(seed: number, frames: number): RunResult {
  const world = new World(seed);
  const actor = world.add(new TestActor());
  const events: string[] = [];
  for (let f = 0; f < frames; f++) {
    const emitted = world.step([scripted(f)]);
    for (const e of emitted) events.push(`${world.tick - 1}:${e.type}:${JSON.stringify(e.data)}`);
  }
  return { hash: world.hash(), tick: world.tick, events, actor: { x: actor.x, hp: actor.hp, hits: actor.hits } };
}

describe('Rng 确定性', () => {
  it('同种子同序列，不同种子不同序列', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    const c = new Rng(4321);
    const seqA = Array.from({ length: 8 }, () => a.nextU32());
    const seqB = Array.from({ length: 8 }, () => b.nextU32());
    const seqC = Array.from({ length: 8 }, () => c.nextU32());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('状态可存取（回放/存档要能还原）', () => {
    const a = new Rng(7);
    a.nextU32();
    const saved = a.getState();
    const expected = [a.nextU32(), a.nextU32()];
    const b = new Rng(1);
    b.setState(saved);
    expect([b.nextU32(), b.nextU32()]).toEqual(expected);
  });

  it('int() 落在区间内，且 seed=0 也不会卡在不动点', () => {
    const r = new Rng(0);
    const values = Array.from({ length: 200 }, () => r.int(10));
    expect(values.every((v) => v >= 0 && v < 10)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe('世界：同输入 600 帧完全一致', () => {
  const first = runFrames(0xc0ffee, 600);
  const second = runFrames(0xc0ffee, 600);

  it('哈希一致', () => {
    expect(first.hash).toBe(second.hash);
  });

  it('tick 与事件序列一致', () => {
    expect(first.tick).toBe(600);
    expect(first.events).toEqual(second.events);
    expect(first.events.length).toBeGreaterThan(0);
  });

  it('实体状态一致', () => {
    expect(first.actor).toEqual(second.actor);
    expect(first.actor.hits).toBeGreaterThan(1);
  });

  it('换种子 → 哈希不同（随机性确实进了状态）', () => {
    const other = runFrames(1, 600);
    expect(other.hash).not.toBe(first.hash);
  });

  it('换输入 → 哈希不同', () => {
    const world = new World(0xc0ffee);
    world.add(new TestActor());
    for (let f = 0; f < 600; f++) world.step([makeInput(Btn.Left)]);
    expect(world.hash()).not.toBe(first.hash);
  });
});

describe('World 的基础行为', () => {
  it('实体按添加顺序拿 id，边沿只在第一帧出现', () => {
    const world = new World(1);
    const a = world.add(new TestActor());
    const b = world.add(new TestActor());
    expect([a.id, b.id]).toEqual([0, 1]);

    world.step([makeInput(Btn.C | Btn.Right)]);
    expect(a.pressed).toBe(Btn.C | Btn.Right);
    expect(b.pressed).toBe(0); // 没给输入 = 无输入

    world.step([makeInput(Btn.C | Btn.Right)]);
    expect(a.pressed).toBe(0); // 按住不重复触发
  });

  it('事件每帧清空，不跨帧累积', () => {
    const world = new World(1);
    world.add(new TestActor());
    const e1 = world.step([makeInput(Btn.C)]).length;
    const e2 = world.step([makeInput(0)]).length;
    expect(e1).toBe(1);
    expect(e2).toBe(0);
  });

  it('缺省输入不会越界', () => {
    const world = new World(1);
    world.add(new TestActor());
    world.add(new TestActor());
    expect(() => world.step([])).not.toThrow();
    expect(world.tick).toBe(1);
  });
});

describe('FixedStepper 固定步长', () => {
  it('攒够一帧才跑一帧，余量保留', () => {
    const stepper = new FixedStepper(10, 5);
    let ran = 0;
    expect(stepper.advance(9, () => ran++)).toBe(0);
    expect(stepper.advance(1, () => ran++)).toBe(1);
    expect(ran).toBe(1);
    expect(stepper.leftoverMs).toBeCloseTo(0);
  });

  it('长时间卡顿只补上限帧数，剩余丢弃', () => {
    const stepper = new FixedStepper(10, 5);
    let ran = 0;
    expect(stepper.advance(1000, () => ran++)).toBe(5);
    expect(ran).toBe(5);
    expect(stepper.leftoverMs).toBe(0);
  });

  it('非法/零 delta 不推进', () => {
    const stepper = new FixedStepper(10, 5);
    expect(stepper.advance(0, () => {})).toBe(0);
    expect(stepper.advance(Number.NaN, () => {})).toBe(0);
    expect(stepper.advance(-5, () => {})).toBe(0);
  });

  it('默认步长是 1/60 秒', () => {
    expect(TICK_MS).toBeCloseTo(16.6667, 3);
    const stepper = new FixedStepper();
    let ran = 0;
    stepper.advance(1000, () => ran++);
    expect(ran).toBe(6); // 封顶 MAX_STEPS_PER_FRAME，不是 60
  });
});
