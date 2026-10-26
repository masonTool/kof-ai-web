import { describe, expect, it } from 'vitest';
import { PALETTES } from '../src/data/chars/palette';
import { KYO } from '../src/data/chars/kyo';
import { drawFighter } from '../src/render/fighter-draw';
import { poseMotion } from '../src/render/renderer';
import { Fighter } from '../src/sim/fighter';
import {
  currentAssetProvider,
  hasCustomArt,
  frameListProvider,
  setAssetProvider,
  spriteFor,
  spriteSheetProvider,
} from '../src/render/assets';
import { POSE_LIBRARY, poseFrameIndex, resolvePose } from '../src/render/poses';
import { FakeCtx } from './helpers/fake-ctx';

/** 假的图片对象：只要能当 CanvasImageSource 传进去即可 */
const fakeImage = { width: 256, height: 128 } as unknown as CanvasImageSource;
const palette = PALETTES['kyo']!;

describe('精灵表 provider', () => {
  const provider = spriteSheetProvider({
    kyo: {
      image: fakeImage,
      frameW: 32,
      frameH: 48,
      columns: 8,
      anims: { idle: 4, punchLight: 3, win: 2 },
    },
  });

  it('按声明顺序算出行列（idle 0-3、punchLight 从第 4 帧开始）', () => {
    expect(provider.fighter('kyo', 'idle', 0)).toMatchObject({ sx: 0, sy: 0, sw: 32, sh: 48 });
    expect(provider.fighter('kyo', 'idle', 3)).toMatchObject({ sx: 96, sy: 0 });
    expect(provider.fighter('kyo', 'punchLight', 0)).toMatchObject({ sx: 128, sy: 0 });
    expect(provider.fighter('kyo', 'punchLight', 2)).toMatchObject({ sx: 192, sy: 0 });
  });

  it('帧号越界会折回（循环动画最后一帧之后又回到第一帧）', () => {
    expect(provider.fighter('kyo', 'idle', 4)).toEqual(provider.fighter('kyo', 'idle', 0));
    expect(provider.fighter('kyo', 'idle', -1)).toEqual(provider.fighter('kyo', 'idle', 3));
  });

  it('没声明的动画/角色返回 null（回落程序化绘制）', () => {
    expect(provider.fighter('kyo', '根本不存在的动画', 0)).toBeNull();
    expect(provider.fighter('iori', 'idle', 0)).toBeNull();
  });

  it('跨行排布：排满 columns 后 sy 增加一行', () => {
    const wide = spriteSheetProvider({
      x: { image: fakeImage, frameW: 10, frameH: 20, columns: 2, anims: { a: 2, b: 2 } },
    });
    expect(wide.fighter('x', 'a', 0)).toMatchObject({ sx: 0, sy: 0 });
    expect(wide.fighter('x', 'a', 1)).toMatchObject({ sx: 10, sy: 0 });
    expect(wide.fighter('x', 'b', 0)).toMatchObject({ sx: 0, sy: 20 });
    expect(wide.fighter('x', 'b', 1)).toMatchObject({ sx: 10, sy: 20 });
  });
});

describe('绘制层接管', () => {
  const draw = (charId?: string): FakeCtx => {
    const ctx = new FakeCtx();
    drawFighter(ctx, {
      palette,
      facing: 1,
      x: 100,
      y: 200,
      anim: 'idle',
      elapsed: 0,
      charId,
    });
    return ctx;
  };

  it('没有 provider 时走骨架绘制（不调 drawImage）', () => {
    setAssetProvider(null);
    const ctx = draw('kyo');
    expect(ctx.images).toHaveLength(0);
    expect(ctx.arcs.length).toBeGreaterThan(0);
  });

  it('装了 provider 就贴图，且不再画骨架', () => {
    setAssetProvider(
      spriteSheetProvider({
        kyo: { image: fakeImage, frameW: 32, frameH: 48, anims: { idle: 4 } },
      }),
    );
    expect(hasCustomArt()).toBe(true);
    const ctx = draw('kyo');
    expect(ctx.images).toHaveLength(1);
    expect(ctx.arcs).toHaveLength(0);

    // 默认底部居中对齐：贴图底边在原点、水平居中
    const img = ctx.images[0]!;
    expect(img.dx).toBe(-16);
    expect(img.dy).toBe(-48);
    expect(img.dw).toBe(32);
    expect(img.dh).toBe(48);
    setAssetProvider(null);
  });

  it('有剪影帧时，闪白直接贴剪影，不再盖白方块', () => {
    setAssetProvider(
      frameListProvider({
        kyo: {
          image: fakeImage,
          frames: { hit: [{ image: fakeImage, sx: 0, sy: 0, sw: 40, sh: 60, offsetX: -20, offsetY: -60 }] },
          flashFrames: {
            hit: [{ image: fakeImage, sx: 40, sy: 0, sw: 40, sh: 60, offsetX: -20, offsetY: -60, silhouette: true }],
          },
        },
      }),
    );
    const ctx = new FakeCtx();
    drawFighter(ctx, { palette, facing: 1, x: 100, y: 200, anim: 'hit', elapsed: 0, charId: 'kyo', flash: true });
    expect(ctx.images[0]!.sx).toBe(40); // 拿的是剪影那块
    expect(ctx.rects).toHaveLength(0); // 没有白方块
    setAssetProvider(null);
  });

  it('没有剪影帧就退回"盖白块"（老的手绘精灵表还能用）', () => {
    setAssetProvider(
      frameListProvider({
        kyo: { image: fakeImage, frames: { hit: [{ image: fakeImage, sx: 0, sy: 0, sw: 40, sh: 60, offsetX: -20, offsetY: -60 }] } },
      }),
    );
    const ctx = new FakeCtx();
    drawFighter(ctx, { palette, facing: 1, x: 100, y: 200, anim: 'hit', elapsed: 0, charId: 'kyo', flash: true });
    expect(ctx.rects).toHaveLength(1);
    setAssetProvider(null);
  });

  it('没提供贴图的角色照样回落骨架（可以只做一部分角色）', () => {
    setAssetProvider(
      spriteSheetProvider({
        kyo: { image: fakeImage, frameW: 32, frameH: 48, anims: { idle: 4 } },
      }),
    );
    const ctx = draw('iori');
    expect(ctx.images).toHaveLength(0);
    expect(ctx.arcs.length).toBeGreaterThan(0);
    setAssetProvider(null);
  });

  it('贴图角色也能闪白（命中反馈不能丢）', () => {
    setAssetProvider(
      spriteSheetProvider({
        kyo: { image: fakeImage, frameW: 32, frameH: 48, anims: { idle: 4 } },
      }),
    );
    const ctx = new FakeCtx();
    drawFighter(ctx, {
      palette,
      facing: 1,
      x: 0,
      y: 0,
      anim: 'idle',
      elapsed: 0,
      charId: 'kyo',
      flash: true,
    });
    expect(ctx.fills.some((f) => f.startsWith('rgba(255,255,255'))).toBe(true);
    setAssetProvider(null);
  });

  it('贴图按同一个帧下标取（和骨架姿势对齐）', () => {
    const frames: number[] = [];
    setAssetProvider({
      fighter: (_charId, _anim, frame) => {
        frames.push(frame);
        return null;
      },
    });
    const ctx = new FakeCtx();
    drawFighter(ctx, { palette, facing: 1, x: 0, y: 0, anim: 'punchHeavy', elapsed: 12, duration: 24, charId: 'kyo' });
    // 贴图取的那一帧，必须和骨架"最近的关键帧"是同一个（骨架现在会插值，不能直接比姿势）
    expect(frames[0]).toBe(poseFrameIndex('punchHeavy', 12, 24));
    expect(resolvePose('punchHeavy', 12, 24)).not.toEqual(POSE_LIBRARY['punchHeavy']!.frames[frames[0]!]);
    setAssetProvider(null);
    expect(currentAssetProvider()).toBeNull();
    expect(spriteFor('kyo', 'idle', 0)).toBeNull();
  });
});

describe('旋转绘制', () => {
  it('传了 spin 就真的调用 rotate（不是只存在状态里）', () => {
    const ctx = new FakeCtx();
    drawFighter(ctx, { palette: KYO.palette, facing: 1, x: 0, y: 0, anim: 'idle', elapsed: 0, spin: 0.5 });
    expect(ctx.transforms.rotate).toContain(0.5);
  });

  it('没传 spin 时不转（站着不能自己转）', () => {
    const ctx = new FakeCtx();
    drawFighter(ctx, { palette: KYO.palette, facing: 1, x: 0, y: 0, anim: 'idle', elapsed: 0 });
    expect(ctx.transforms.rotate.length).toBe(0);
  });
});

describe('程序化补间（呼吸 / 蓄力）', () => {
  const mkF = (): Fighter => new Fighter(KYO, { x: 100, facing: 1 });

  it('站着会呼吸：dy 随时间变化且幅度很小（不超过 1px）', () => {
    const f = mkF();
    const a = poseMotion(f, 0);
    const b = poseMotion(f, 20);
    expect(a.dy).not.toBe(b.dy); // 会动
    expect(Math.abs(a.dy)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.dy)).toBeLessThanOrEqual(1);
  });

  it('出招时不呼吸（避免和动作姿态打架）', () => {
    const f = mkF();
    f.startMove(KYO.moves['5A']!);
    const m = poseMotion(f, 20);
    expect(m.dy).toBe(0);
  });

  it('必杀起手前 8 帧压扁并后撤，之后就恢复', () => {
    const f = mkF();
    f.startMove(KYO.moves['236A']!);
    const early = poseMotion(f, 0);
    expect(early.squash).toBeLessThan(0); // 压扁
    expect(early.dx).toBeLessThan(0); // 面朝右时往后（左）撤
    // 推到第 8 帧之后
    for (let i = 0; i < 9; i++) f.step({} as never, { held: 0, pressed: 0 } as never);
    const late = poseMotion(f, 0);
    expect(late.squash).toBe(0);
    expect(late.dx).toBe(0);
  });
});
