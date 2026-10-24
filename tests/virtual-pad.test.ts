import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { VirtualPad } from '../src/ui/virtual-pad';

describe('虚拟按键', () => {
  it('按下/松开对应方向位', () => {
    const pad = new VirtualPad();
    expect(pad.sampleFrame().held).toBe(0);
    pad.press('left');
    expect(pad.sampleFrame().held).toBe(Btn.Left); // 采到一帧
    pad.release('left');
    expect(pad.sampleFrame().held).toBe(0);
  });

  it('多键同时按住会合并', () => {
    const pad = new VirtualPad();
    pad.press('right');
    pad.press('A');
    expect(pad.sampleFrame().held).toBe(Btn.Right | Btn.A);
    expect(pad.snapshot().sort()).toEqual(['A', 'right']);
    pad.release('right');
    expect(pad.sampleFrame().held).toBe(Btn.A);
  });

  it('重复按下不会出问题', () => {
    const pad = new VirtualPad();
    pad.press('up');
    pad.press('up');
    expect(pad.sampleFrame().held).toBe(Btn.Up);
    pad.release('up');
    expect(pad.sampleFrame().held).toBe(0);
  });

  it('releaseAll 用于切窗/失焦（防粘键）', () => {
    const pad = new VirtualPad();
    pad.press('left');
    pad.press('down');
    pad.press('C');
    pad.releaseAll();
    expect(pad.sampleFrame().held).toBe(0);
    expect(pad.snapshot()).toEqual([]);
  });

  it('sample 能直接喂给模拟层', () => {
    const pad = new VirtualPad();
    pad.press('down');
    pad.press('D');
    expect(pad.sample).toEqual({ held: Btn.Down | Btn.D });
  });

  it('isDown 反映单个键状态', () => {
    const pad = new VirtualPad();
    pad.press('B');
    expect(pad.isDown('B')).toBe(true);
    expect(pad.isDown('C')).toBe(false);
  });
});

describe('快速单击不丢帧（鼠标点按的关键）', () => {
  it('按下立刻抬起、中间没有采样 → 仍能拿到一帧按下', () => {
    const pad = new VirtualPad();
    pad.press('A');
    pad.release('A'); // 两帧之间就抬起了
    expect(pad.sampleFrame().held).toBe(Btn.A);
    expect(pad.sampleFrame().held).toBe(0); // 只补一帧，不会粘住
  });

  it('按住跨帧时不会被补帧逻辑拖尾', () => {
    const pad = new VirtualPad();
    pad.press('A');
    expect(pad.sampleFrame().held).toBe(Btn.A); // 这一帧被采到了
    pad.release('A');
    expect(pad.sampleFrame().held).toBe(0);
  });

  it('多个键同时快速点按都能补上', () => {
    const pad = new VirtualPad();
    pad.press('C');
    pad.press('D');
    pad.release('C');
    pad.release('D');
    expect(pad.sampleFrame().held).toBe(Btn.C | Btn.D);
  });
});
