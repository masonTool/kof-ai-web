import { describe, expect, it } from 'vitest';
import sheetJson from '../public/sheets/kyo.json';
import { frameListProvider, type FrameListSheet, type SpriteFrame } from '../src/render/assets';
import { isSheetJson, providerFromSheetJson, type SheetJson } from '../src/render/sprite-loader';

const IMG = {} as unknown as CanvasImageSource;

function frame(sx: number, sy: number): SpriteFrame {
  return { image: IMG, sx, sy, sw: 10, sh: 20, offsetX: -5, offsetY: -20 };
}

describe('逐帧矩形贴图（frameListProvider）', () => {
  const sheet: FrameListSheet = {
    image: IMG,
    frames: { idle: [frame(0, 0)], punch: [frame(10, 0), frame(20, 0), frame(30, 0)] },
  };
  const provider = frameListProvider({ kyo: sheet });

  it('按动画名和帧号取到对应矩形', () => {
    expect(provider.fighter('kyo', 'punch', 1)?.sx).toBe(20);
    expect(provider.fighter('kyo', 'punch', 2)?.sx).toBe(30);
  });

  it('越界和负数帧号都折回范围内', () => {
    expect(provider.fighter('kyo', 'punch', 4)?.sx).toBe(20);
    expect(provider.fighter('kyo', 'punch', -1)?.sx).toBe(30);
    expect(provider.fighter('kyo', 'punch', 1.6)?.sx).toBe(30); // 小数先四舍五入
  });

  it('闪白时优先用剪影帧，没有剪影就退回普通帧', () => {
    const withFlash = frameListProvider({
      kyo: {
        image: IMG,
        frames: { hit: [frame(0, 0)] },
        flashFrames: { hit: [{ ...frame(40, 0), silhouette: true }] },
      },
    });
    expect(withFlash.fighter('kyo', 'hit', 0, true)?.sx).toBe(40);
    expect(withFlash.fighter('kyo', 'hit', 0, true)?.silhouette).toBe(true);
    expect(withFlash.fighter('kyo', 'hit', 0, false)?.sx).toBe(0);
    // punch 没有剪影 → 还是普通帧，绘制层会退回盖白块
    expect(withFlash.fighter('kyo', 'punch', 0, true)).toBeNull();
  });

  it('没有的动画/角色返回 null（交给程序化绘制）', () => {
    expect(provider.fighter('kyo', 'dizzy', 0)).toBeNull();
    expect(provider.fighter('iori', 'idle', 0)).toBeNull();
  });

  it('空帧列表也返回 null', () => {
    const empty = frameListProvider({ kyo: { image: IMG, frames: { idle: [] } } });
    expect(empty.fighter('kyo', 'idle', 0)).toBeNull();
  });
});

describe('贴图 JSON', () => {
  const json: SheetJson = {
    image: 'kyo.png',
    width: 100,
    height: 50,
    anims: { idle: [{ x: 1, y: 2, w: 10, h: 20, ox: -5, oy: -20 }] },
  };

  it('JSON 映射成 SpriteFrame（偏移原样带过去）', () => {
    const p = providerFromSheetJson('kyo', IMG, json);
    const f = p.fighter('kyo', 'idle', 0);
    expect(f).toMatchObject({ sx: 1, sy: 2, sw: 10, sh: 20, offsetX: -5, offsetY: -20 });
  });

  it('形状不对的 JSON 一律拒绝', () => {
    expect(isSheetJson(json)).toBe(true);
    expect(isSheetJson(null)).toBe(false);
    expect(isSheetJson({ ...json, image: 42 })).toBe(false);
    expect(isSheetJson({ ...json, anims: { idle: 'nope' } })).toBe(false);
    expect(isSheetJson({ ...json, anims: { idle: [{ x: 0, y: 0, w: 1, h: 1, ox: 0 }] } })).toBe(false);
  });
});

describe('京的贴图产物（build-kyo.mjs 的输出）', () => {
  const raw: unknown = sheetJson;
  if (!isSheetJson(raw)) throw new Error('public/sheets/kyo.json 形状不合法，先跑 node scripts/sprites/build-kyo.mjs');
  const sheet = raw;

  it('关键动画都在（缺了会掉回程序化骨架，风格会跳）', () => {
    for (const anim of ['idle', 'walkF', 'walkB', 'guard', 'crouch', 'jump', 'punchLight', 'punchHeavy', 'kickLight', 'kickHeavy', 'hit', 'win', 'down']) {
      expect(sheet.anims[anim], anim).toBeTruthy();
    }
  });

  it('每一帧都落在图集范围内，且偏移与尺寸自洽', () => {
    for (const [anim, list] of Object.entries(sheet.anims)) {
      for (const f of list) {
        expect(f.w, anim).toBeGreaterThan(0);
        expect(f.h, anim).toBeGreaterThan(0);
        expect(f.x + f.w, anim).toBeLessThanOrEqual(sheet.width);
        expect(f.y + f.h, anim).toBeLessThanOrEqual(sheet.height);
        expect(f.ox, anim).toBeLessThan(0);
        expect(f.oy + f.h, anim).toBe(0); // 包围盒底边对齐脚下原点
      }
    }
  });

  it('每个动画都带同步的闪白剪影（否则挨打时会在角色周围糊出白方块）', () => {
    expect(sheet.flash).toBeTruthy();
    for (const [anim, list] of Object.entries(sheet.anims)) {
      const flash = sheet.flash?.[anim];
      expect(flash, anim).toBeTruthy();
      expect(flash!.length, anim).toBe(list.length);
      flash!.forEach((f, i) => {
        expect({ ...f, x: 0, y: 0 }).toEqual({ ...list[i]!, x: 0, y: 0 }); // 几何必须完全一致
        expect(f.y + f.h, anim).toBeLessThanOrEqual(sheet.height);
      });
    }
  });

  it('站姿身高对得上角色的 84 逻辑像素，蹲姿明显更矮', () => {
    expect(sheet.anims.idle[0]!.h).toBeGreaterThanOrEqual(80);
    expect(sheet.anims.idle[0]!.h).toBeLessThanOrEqual(90);
    expect(sheet.anims.crouch[0]!.h).toBeLessThan(sheet.anims.idle[0]!.h - 12);
    expect(sheet.anims.down[0]!.h).toBeLessThan(sheet.anims.idle[0]!.h / 2); // 躺着
  });

  it('出拳帧比站姿伸得更远（手真的打出去了）', () => {
    const idle = sheet.anims.idle[0]!;
    const punch = sheet.anims.punchLight![1]!;
    expect(punch.w).toBeGreaterThan(idle.w + 6);
  });
});
