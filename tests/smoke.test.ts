import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, computeViewport } from '../src/render/scale';

describe('视口缩放', () => {
  it('逻辑分辨率是 MVS 的 320×224', () => {
    expect(LOGICAL_WIDTH).toBe(320);
    expect(LOGICAL_HEIGHT).toBe(224);
  });

  it('窗口够大时用整数倍缩放并居中', () => {
    const vp = computeViewport(1280, 800, 2);
    expect(vp.scale).toBe(3);
    expect(vp.cssWidth).toBe(960);
    expect(vp.cssHeight).toBe(672);
    expect(vp.offsetX).toBe(160);
    expect(vp.offsetY).toBe(64);
  });

  it('窗口比逻辑分辨率小时退化成小数缩放', () => {
    const vp = computeViewport(160, 112);
    expect(vp.scale).toBeCloseTo(0.5);
    expect(vp.cssWidth).toBe(160);
    expect(vp.cssHeight).toBe(112);
  });

  it('手机横屏 640×360 用 1 倍（2 倍装不下）', () => {
    const vp = computeViewport(640, 360, 3);
    expect(vp.scale).toBe(1);
    expect(vp.offsetX).toBe(160);
    expect(vp.offsetY).toBe(68);
  });

  it('非法 dpr 退回 1', () => {
    expect(computeViewport(640, 480, 0).dpr).toBe(1);
  });
});
