import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, computeViewport, effectiveDpr, shouldRotate } from '../src/render/scale';

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

describe('移动端适配', () => {
  it('DPR 被夹在 [1, 2]', () => {
    expect(effectiveDpr(3)).toBe(2); // 3x 屏按 2x 渲染就够
    expect(effectiveDpr(2)).toBe(2);
    expect(effectiveDpr(1.5)).toBe(1.5);
    expect(effectiveDpr(0.5)).toBe(1);
    expect(effectiveDpr(Number.NaN)).toBe(1);
    expect(computeViewport(640, 360, 3).dpr).toBe(2);
  });

  it('安全区会从可用区域里扣掉，画面居中在剩余区域', () => {
    const plain = computeViewport(640, 360, 2);
    const inset = computeViewport(640, 360, 2, { top: 20, right: 0, bottom: 40, left: 10 });
    // 上下被切掉 60px 之后虽然还是能放下同样的整数倍，但偏移要重新算
    expect(inset.offsetY).toBeGreaterThanOrEqual(20);
    expect(inset.offsetX).toBeGreaterThanOrEqual(10);
    expect(inset.cssWidth).toBeLessThanOrEqual(plain.cssWidth);
  });

  it('可用区域变小会导致缩放变小', () => {
    const big = computeViewport(640, 480, 1);
    const shrunk = computeViewport(640, 480, 1, { top: 100, right: 0, bottom: 100, left: 0 });
    expect(shrunk.scale).toBeLessThan(big.scale);
  });

  it('竖屏判定：明显竖着才提示旋转', () => {
    expect(shouldRotate(390, 844)).toBe(true); // 手机竖屏
    expect(shouldRotate(844, 390)).toBe(false); // 手机横屏
    expect(shouldRotate(1280, 800)).toBe(false); // 桌面
    expect(shouldRotate(800, 800)).toBe(false); // 正方形不算
  });
});
