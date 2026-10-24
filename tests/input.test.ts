import { describe, expect, it } from 'vitest';
import { Btn, edges } from '../src/core/input';
import { InputBuffer } from '../src/input/buffer';
import { DEFAULT_KEYMAP_P1, DEFAULT_KEYMAP_P2, heldFromKeys } from '../src/input/keyboard';
import { DEFAULT_PAD_MAP, GamepadSource, heldFromPad } from '../src/input/gamepad';
import {
  CHARGE_FRAMES,
  CommandParser,
  MOTION_TAIL,
  matchMotion,
  numpadOf,
} from '../src/input/parser';
import type { InputSpec } from '../src/data/schema';

const D = Btn.Down;
const U = Btn.Up;
const L = Btn.Left;
const R = Btn.Right;
const A = Btn.A;

/** 依次喂若干帧的"按住掩码"，内部维护按住状态算边沿 */
function feed(parser: CommandParser, frames: number[]): void {
  let prev = parser.buffer.current().held;
  for (const held of frames) {
    parser.push(edges(held, prev));
    prev = held;
  }
}

function repeat(held: number, times: number): number[] {
  return Array.from({ length: times }, () => held);
}

describe('小键盘方向（朝向相对）', () => {
  it('面朝右：6 是右、4 是左', () => {
    expect(numpadOf(0, 1)).toBe(5);
    expect(numpadOf(R, 1)).toBe(6);
    expect(numpadOf(L, 1)).toBe(4);
    expect(numpadOf(D, 1)).toBe(2);
    expect(numpadOf(D | R, 1)).toBe(3);
    expect(numpadOf(D | L, 1)).toBe(1);
    expect(numpadOf(U, 1)).toBe(8);
    expect(numpadOf(U | R, 1)).toBe(9);
  });

  it('面朝左：左右互换', () => {
    expect(numpadOf(L, -1)).toBe(6);
    expect(numpadOf(R, -1)).toBe(4);
    expect(numpadOf(D | L, -1)).toBe(3);
    expect(numpadOf(D | R, -1)).toBe(1);
  });

  it('左右同时按视为中立', () => {
    expect(numpadOf(L | R, 1)).toBe(5);
  });
});

describe('输入历史缓冲', () => {
  it('按容量裁剪，最近的在最后', () => {
    const buf = new InputBuffer(3);
    buf.push(edges(R, 0));
    buf.push(edges(D, R));
    buf.push(edges(D | R, D));
    buf.push(edges(0, D | R));
    expect(buf.length).toBe(3);
    expect(buf.heldHistory(10)).toEqual([D, D | R, 0]);
    expect(buf.current().held).toBe(0);
  });

  it('pressedWithin 只看按下过的帧', () => {
    const buf = new InputBuffer();
    buf.push(edges(R, 0));
    buf.push(edges(R | A, R));
    buf.push(edges(R, R | A));
    expect(buf.pressedWithin(A, 3)).toBe(true);
    expect(buf.pressedWithin(Btn.C, 3)).toBe(false);
  });

  it('空缓冲返回无输入', () => {
    const buf = new InputBuffer();
    expect(buf.current().held).toBe(0);
    expect(buf.heldHistory(5)).toEqual([]);
  });
});

describe('必杀技指令识别', () => {
  it('236（波动）：下 → 下前 → 前 + 键', () => {
    const p = new CommandParser(1);
    feed(p, [D, D | R, R | A]);
    const spec: InputSpec = { motion: '236', buttons: ['A'] };
    expect(p.match(spec)).toBe(true);
  });

  it('236 少了下前那一帧就不成立（不能偷懒直推）', () => {
    const p = new CommandParser(1);
    feed(p, [D, R | A]);
    expect(p.match({ motion: '236', buttons: ['A'] })).toBe(false);
  });

  it('摇完方向松手太久再按键不成立', () => {
    const p = new CommandParser(1);
    feed(p, [D, D | R, R, ...repeat(0, MOTION_TAIL + 2), A]);
    expect(p.match({ motion: '236', buttons: ['A'] })).toBe(false);
  });

  it('按住前不放再按键仍然成立（KOF 允许）', () => {
    const p = new CommandParser(1);
    feed(p, [D, D | R, ...repeat(R, 6), R | A]);
    expect(p.match({ motion: '236', buttons: ['A'] })).toBe(true);
  });

  it('623（升龙）：前 → 下 → 下前', () => {
    const p = new CommandParser(1);
    feed(p, [R, D, D | R | A]);
    expect(p.match({ motion: '623', buttons: ['A'] })).toBe(true);
  });

  it('214（后下前反向）', () => {
    const p = new CommandParser(1);
    feed(p, [D, D | L, L | A]);
    expect(p.match({ motion: '214', buttons: ['A'] })).toBe(true);
  });

  it('41236（半圈前）与 63214（半圈后）', () => {
    const fwd = new CommandParser(1);
    feed(fwd, [L, D | L, D, D | R, R | A]);
    expect(fwd.match({ motion: '41236', buttons: ['A'] })).toBe(true);

    const back = new CommandParser(1);
    feed(back, [R, D | R, D, D | L, L | A]);
    expect(back.match({ motion: '63214', buttons: ['A'] })).toBe(true);
  });

  it('22（下下）：中间要松开', () => {
    const p = new CommandParser(1);
    feed(p, [D, 0, D | A]);
    expect(p.match({ motion: '22', buttons: ['A'] })).toBe(true);

    const held = new CommandParser(1);
    feed(held, [D, D, D | A]);
    expect(held.match({ motion: '22', buttons: ['A'] })).toBe(false);
  });

  it('双击前 = 前冲（不需要按键）', () => {
    const p = new CommandParser(1);
    feed(p, [R, 0, R]);
    expect(p.matchMotion('doubleTapF')).toBe(true);

    const single = new CommandParser(1);
    feed(single, [R, R]);
    expect(single.matchMotion('doubleTapF')).toBe(false);
  });

  it('蓄力后前：够帧数才算', () => {
    const enough = new CommandParser(1);
    feed(enough, [...repeat(L, CHARGE_FRAMES), R | A]);
    expect(enough.match({ motion: 'chargeBack', buttons: ['A'] })).toBe(true);

    const tooShort = new CommandParser(1);
    feed(tooShort, [...repeat(L, CHARGE_FRAMES - 5), R | A]);
    expect(tooShort.match({ motion: 'chargeBack', buttons: ['A'] })).toBe(false);
  });

  it('蓄力下后上', () => {
    const p = new CommandParser(1);
    feed(p, [...repeat(D, CHARGE_FRAMES), U | A]);
    expect(p.match({ motion: 'chargeDown', buttons: ['A'] })).toBe(true);
  });

  it('指令通常技：当前正按住 3 或 6', () => {
    const p = new CommandParser(1);
    feed(p, [D | R | A]);
    expect(p.match({ motion: '3', buttons: ['A'] })).toBe(true);
    expect(p.match({ motion: '6' })).toBe(false);
  });

  it('朝向为左时，指令方向整体镜像', () => {
    const p = new CommandParser(-1);
    feed(p, [D, D | L, L | A]);
    expect(p.match({ motion: '236', buttons: ['A'] })).toBe(true);

    const wrong = new CommandParser(-1);
    feed(wrong, [D, D | R, R | A]);
    expect(wrong.match({ motion: '236', buttons: ['A'] })).toBe(false);
  });
});

describe('按键组合', () => {
  it('CD 必须同帧按下', () => {
    const p = new CommandParser(1);
    feed(p, [R | Btn.C | Btn.D]);
    expect(p.match({ motion: 'none', buttons: ['C', 'D'] })).toBe(true);

    const oneByOne = new CommandParser(1);
    feed(oneByOne, [R | Btn.C, R | Btn.C | Btn.D]);
    expect(oneByOne.match({ motion: 'none', buttons: ['C', 'D'] })).toBe(false);
  });

  it('单键按住在下一帧不再算"按下"', () => {
    const p = new CommandParser(1);
    feed(p, [A]);
    expect(p.match({ motion: 'none', buttons: ['A'] })).toBe(true);
    feed(p, [A]);
    expect(p.match({ motion: 'none', buttons: ['A'] })).toBe(false);
  });
});

describe('matchMotion 纯函数', () => {
  it('窗口外的帧不参与判定', () => {
    const history = [D | R, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(matchMotion('236', history, 1)).toBe(false);
    expect(matchMotion('none', history, 1)).toBe(true);
  });
});

describe('键盘映射', () => {
  it('P1 方向键 + JKUI', () => {
    expect(heldFromKeys(['ArrowRight', 'KeyJ'], DEFAULT_KEYMAP_P1)).toBe(Btn.Right | Btn.A);
    expect(heldFromKeys(['ArrowDown', 'ArrowRight', 'KeyI'], DEFAULT_KEYMAP_P1)).toBe(
      Btn.Down | Btn.Right | Btn.D,
    );
    expect(heldFromKeys(['KeyZ'], DEFAULT_KEYMAP_P1)).toBe(0);
  });

  it('P2 WASD + GHTY', () => {
    expect(heldFromKeys(['KeyW', 'KeyY'], DEFAULT_KEYMAP_P2)).toBe(Btn.Up | Btn.D);
  });
});

describe('手柄映射', () => {
  const pads = (over: Partial<{ axes: number[]; pressed: number[] }> = {}): {
    axes: number[];
    buttons: { pressed: boolean }[];
  } => ({
    axes: over.axes ?? [0, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: (over.pressed ?? []).includes(i) })),
  });

  it('摇杆方向与死区', () => {
    expect(heldFromPad(pads({ axes: [0.9, 0] }))).toBe(Btn.Right);
    expect(heldFromPad(pads({ axes: [-0.9, 0] }))).toBe(Btn.Left);
    expect(heldFromPad(pads({ axes: [0, 0.9] }))).toBe(Btn.Down);
    expect(heldFromPad(pads({ axes: [0.3, 0] }))).toBe(0); // 死区内
  });

  it('按键位映射到 A/B/C/D', () => {
    expect(heldFromPad(pads({ pressed: [2] }))).toBe(Btn.A);
    expect(heldFromPad(pads({ pressed: [0, 3] }))).toBe(Btn.B | Btn.C);
    expect(heldFromPad(pads({ pressed: [9] }))).toBe(Btn.Start);
  });

  it('自定义映射生效', () => {
    expect(heldFromPad(pads({ pressed: [5] }), { ...DEFAULT_PAD_MAP, buttons: { ...DEFAULT_PAD_MAP.buttons, A: 5 } })).toBe(Btn.A);
  });

  it('没有手柄时返回空输入', () => {
    const source = new GamepadSource(0);
    expect(source.read(() => []).held).toBe(0);
    expect(source.read(() => [pads({ axes: [0, -0.9] })]).held).toBe(Btn.Up);
  });
});
