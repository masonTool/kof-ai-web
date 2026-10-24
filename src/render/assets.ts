/**
 * 素材入口（唯一一处）。
 *
 * 现在所有角色都是程序化绘制（没有素材）。将来若用户提供自绘贴图，
 * 在这里塞一个 `AssetProvider` 就能整只换皮：绘制层先问 `spriteFor()`，
 * 拿到帧就贴图，拿不到就回落到骨架绘制。**玩法/数据层完全不需要改。**
 */
export interface SpriteFrame {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 贴图相对角色原点的偏移（脚底中心）；不写就按帧尺寸居中底部对齐 */
  offsetX?: number;
  offsetY?: number;
  /**
   * 源像素 → 世界单位的换算（默认 1）。
   *
   * 贴图可以烘得比逻辑尺寸大：屏幕上一个逻辑像素其实占 6 个物理像素，
   * 按 1:1 烘出来才不会糊。这时 `sw/sh` 是源像素，宽高都要乘这个系数才是世界尺寸。
   */
  sizeScale?: number;
  /**
   * 这一帧本身就是纯白剪影（受击闪白专用）。
   *
   * 为什么要专门画一版：贴图是不规则形状，闪白如果直接盖 `fillRect`
   * 会在角色周围糊出一个白方块。剪影由素材管线一起烘进图集，画的时候直接贴。
   */
  silhouette?: boolean;
}

export interface AssetProvider {
  /**
   * 取某个角色某个动画某一帧的贴图；没有就返回 null（回落程序化绘制）。
   * `flash` 为 true 时优先返回纯白剪影帧（没有剪影就返回普通帧）。
   */
  fighter(charId: string, anim: string, frame: number, flash?: boolean): SpriteFrame | null;
}

let provider: AssetProvider | null = null;

export function setAssetProvider(next: AssetProvider | null): void {
  provider = next;
}

export function currentAssetProvider(): AssetProvider | null {
  return provider;
}

export function hasCustomArt(): boolean {
  return provider !== null;
}

export function spriteFor(charId: string, anim: string, frame: number, flash = false): SpriteFrame | null {
  if (!provider) return null;
  return provider.fighter(charId, anim, frame, flash);
}

/**
 * 精灵表描述：一张图上按行排所有动画帧。
 *
 * 约定：`anims` 里按声明顺序依次排；每行 `columns` 帧（默认 8），排满换行。
 * 这样美术只要按"动画名 → 帧数"报个数，不用手写每个帧的坐标。
 */
export interface SheetSpec {
  image: CanvasImageSource;
  frameW: number;
  frameH: number;
  /** 动画名 → 帧数（顺序即排布顺序） */
  anims: Record<string, number>;
  columns?: number;
  offsetX?: number;
  offsetY?: number;
}

interface SheetLayout {
  spec: SheetSpec;
  /** 动画名 → 该动画第一帧在表里的序号 */
  start: Map<string, number>;
}

function layoutOf(spec: SheetSpec): SheetLayout {
  const start = new Map<string, number>();
  let index = 0;
  for (const [anim, count] of Object.entries(spec.anims)) {
    start.set(anim, index);
    index += count;
  }
  return { spec, start };
}

/**
 * 逐帧矩形版：每一帧自带在图集里的位置和偏移。
 *
 * 为什么还要这一套（`SheetSpec` 已经能用了）：`SheetSpec` 要求所有帧一样大、
 * 统一偏移，那是"人画的、格子对齐的"精灵表的假设。AI 出的帧每张包围盒都不一样
 * （出拳那帧宽一倍、蹲下那帧矮一截），硬塞进等大格子里会白占一大片透明区，
 * 而且闪白时 `fillRect` 会画出一个大白框。逐帧矩形是这类素材的正确模型。
 */
export interface FrameListSheet {
  image: CanvasImageSource;
  /** 动画名 → 帧列表（顺序就是播放顺序） */
  frames: Record<string, SpriteFrame[]>;
  /** 动画名 → 纯白剪影帧（可选，闪白用） */
  flashFrames?: Record<string, SpriteFrame[]>;
}

/** 用逐帧矩形拼一个 `AssetProvider`（角色 id → 表） */
export function frameListProvider(sheets: Record<string, FrameListSheet>): AssetProvider {
  const byChar = new Map<string, { normal: Map<string, SpriteFrame[]>; flash: Map<string, SpriteFrame[]> }>();
  for (const [charId, sheet] of Object.entries(sheets)) {
    byChar.set(charId, {
      normal: new Map(Object.entries(sheet.frames)),
      flash: new Map(Object.entries(sheet.flashFrames ?? {})),
    });
  }

  return {
    fighter(charId: string, anim: string, frame: number, flash = false): SpriteFrame | null {
      const anims = byChar.get(charId);
      if (!anims) return null;
      const list = (flash ? anims.flash.get(anim) : undefined) ?? anims.normal.get(anim);
      if (!list || list.length === 0) return null;
      const local = ((Math.round(frame) % list.length) + list.length) % list.length;
      return list[local] ?? null;
    },
  };
}

/** 用若干张精灵表拼一个 `AssetProvider`（角色 id → 表） */
export function spriteSheetProvider(sheets: Record<string, SheetSpec>): AssetProvider {
  const layouts = new Map<string, SheetLayout>();
  for (const [charId, spec] of Object.entries(sheets)) layouts.set(charId, layoutOf(spec));

  return {
    fighter(charId: string, anim: string, frame: number): SpriteFrame | null {
      const layout = layouts.get(charId);
      if (!layout) return null;
      const first = layout.start.get(anim);
      if (first === undefined) return null;
      const count = layout.spec.anims[anim] ?? 0;
      if (count <= 0) return null;
      const local = ((frame % count) + count) % count; // 越界/负数都折回范围内
      const columns = layout.spec.columns ?? 8;
      const index = first + local;
      const col = index % columns;
      const row = Math.floor(index / columns);
      return {
        image: layout.spec.image,
        sx: col * layout.spec.frameW,
        sy: row * layout.spec.frameH,
        sw: layout.spec.frameW,
        sh: layout.spec.frameH,
        offsetX: layout.spec.offsetX,
        offsetY: layout.spec.offsetY,
      };
    },
  };
}
