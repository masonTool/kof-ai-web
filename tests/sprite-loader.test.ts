import { describe, expect, it } from 'vitest';
import mainSheet from '../public/sheets/kyo.json';
import extraSheet from '../public/sheets/kyo-extra.json';

/**
 * 图集现在分两片：主片（站架/移动/蹲/防御/轻攻击）+ 扩展片（跳跃/必杀/胜利姿势）。
 * 测试要读**合起来的**动画集，否则会误判"某个动画没了"。
 */
const sheetJson = {
  ...mainSheet,
  anims: { ...mainSheet.anims, ...extraSheet.anims },
  flash: { ...(mainSheet.flash ?? {}), ...(extraSheet.flash ?? {}) },
} as typeof mainSheet;
import { frameListProvider, type FrameListSheet, type SpriteFrame } from '../src/render/assets';
import { POSE_LIBRARY, poseNames } from '../src/render/poses';
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

/**
 * 贴图还在生成中的新姿势：缺失时回落到程序化版本，不算失败。
 * 出完图把它们从这里删掉，测试会重新变成"一个都不能少"。
 */
const OPTIONAL_POSES = new Set<string>([]);

describe('京的贴图产物（build-kyo.mjs 的输出）', () => {
  const raw: unknown = sheetJson;
  if (!isSheetJson(raw)) throw new Error('public/sheets/kyo.json 形状不合法，先跑 node scripts/sprites/build-kyo.mjs');
  const sheet = raw;

  it('姿势库里的每个动画都有贴图（少一个就会在那一下闪回程序化像素人）', () => {
    // 格挡用 block 而不是 guard、蹲重拳用 crouchPunch 而不是 punchHeavy——
    // 名字对不上就是"闪一下旧动画"，所以这里按姿势库全量核对，而不是挑几个抽查。
    //
    // 例外：`OPTIONAL_POSES` 里是"已进姿势库、但贴图还在生成"的新动画。
    // 它们缺失时回落程序化版本（设计如此），出完图会自动从白名单里删掉。
    for (const anim of poseNames()) {
      if (OPTIONAL_POSES.has(anim)) continue;
      const list = sheet.anims[anim];
      expect(list, anim).toBeTruthy();
      expect(list!.length, anim).toBeGreaterThan(0);
    }
  });

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

  it('受击帧带同步的闪白剪影（否则挨打时会在角色周围糊出白方块）', () => {
    // 只有 Hit 状态会闪白，别的帧不烘剪影——图集要留空间给分辨率
    const list = sheet.anims.hit!;
    const flash = sheet.flash?.hit;
    expect(flash).toBeTruthy();
    expect(flash!.length).toBe(list.length);
    flash!.forEach((f, i) => {
      expect({ ...f, x: 0, y: 0 }).toEqual({ ...list[i]!, x: 0, y: 0 }); // 几何必须完全一致
      expect(f.y + f.h).toBeLessThanOrEqual(sheet.height);
    });
  });

  it('站姿烘到高分屏分辨率（一个逻辑像素 ≥4 源像素，屏幕上才不糊），蹲姿明显更矮', () => {
    const px = 1 / sheet.scale!; // 一个逻辑像素 = 几个源像素
    expect(px).toBeGreaterThanOrEqual(4); // 320×224 逻辑分辨率整数放大 3 倍 + Retina 2 倍 = 6
    expect(sheet.anims.idle[0]!.h / px).toBeCloseTo(84, 0);
    expect(sheet.anims.crouch[0]!.h).toBeLessThan(sheet.anims.idle[0]!.h - 12 * px);
    // 躺地是"宽大于高"，比高度更可靠（横躺的人还有肩膀厚度）
    expect(sheet.anims.down[0]!.w).toBeGreaterThan(sheet.anims.down[0]!.h);
  });

  it('换算回世界单位后，站姿仍是 84 高、脚底仍在原点', () => {
    const p = providerFromSheetJson('kyo', {} as unknown as CanvasImageSource, sheet);
    const idle = p.fighter('kyo', 'idle', 0)!;
    const h = idle.sh * (idle.sizeScale ?? 1);
    expect(h).toBeCloseTo(84, 0);
    expect((idle.offsetY ?? 0) + h).toBeCloseTo(0, 5);
  });

  it('出拳帧比站姿伸得更远（手真的打出去了）', () => {
    const idle = sheet.anims.idle[0]!;
    const punch = sheet.anims.punchLight![1]!;
    expect(punch.w).toBeGreaterThan(idle.w + 6);
  });
});

describe('图集分片（首屏只下核心片）', () => {
  it('核心片包含所有"一进场就可能用到"的动作', () => {
    // 少了这些，进对局第一秒就会看到像素人
    for (const anim of ['idle', 'walkF', 'walkB', 'crouch', 'guard', 'hit', 'down', 'punchLight', 'kickLight']) {
      expect(mainSheet.anims[anim as keyof typeof mainSheet.anims], `核心片缺 ${anim}`).toBeTruthy();
    }
  });

  it('扩展片放的是低频动作（跳跃/必杀/胜利），不会和核心片重复', () => {
    for (const anim of ['special', 'superCharge', 'win']) {
      expect(extraSheet.anims[anim as keyof typeof extraSheet.anims], `扩展片缺 ${anim}`).toBeTruthy();
    }
    // 同一个动画不该两片都有（否则白占体积）
    const overlap = Object.keys(mainSheet.anims).filter((a) => a in extraSheet.anims);
    expect(overlap).toEqual([]);
  });

  it('两片合起来覆盖全部 33 个动画（分片不能丢动作）', () => {
    expect(Object.keys(sheetJson.anims).length).toBe(33);
  });
});

describe('必杀起手帧（1 帧 → 2 帧）', () => {
  // 合并后的 anims 是运行时拼的，类型推断只认 main 片，这里按字典访问
  const animsOf = (): Record<string, { w: number; h: number }[]> =>
    sheetJson.anims as unknown as Record<string, { w: number; h: number }[]>;

  it('波动必杀至少两帧：起手 + 出手（单帧放招像"瞬移"，没有发力过程）', () => {
    const frames = animsOf()['specialProjectile'];
    expect(frames).toBeTruthy();
    expect(frames!.length).toBeGreaterThanOrEqual(2);
  });

  it('两帧的包围盒不一样（真是两个不同姿势，不是复制了一份）', () => {
    const frames = animsOf()['specialProjectile']!;
    expect(frames[0]!.w === frames[1]!.w && frames[0]!.h === frames[1]!.h).toBe(false);
  });
});

describe('姿势库与图集的帧数一致', () => {
  it('波动的程序化姿势帧数 = 图集帧数（多了会绕回蓄力，少了会少播）', () => {
    const p = POSE_LIBRARY['specialProjectile']!;
    const frames = (sheetJson.anims as unknown as Record<string, unknown[]>)['specialProjectile']!;
    // 图集每帧对应姿势库一帧：图集取模到自己的长度，
    // 姿势库帧数多于图集时，贴图那边播到多出来的帧会绕回第 0 帧（非循环动画不该绕回）
    expect(p.frames.length).toBe(frames.length);
  });
});
