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
}

export interface AssetProvider {
  /** 取某个角色某个动画某一帧的贴图；没有就返回 null（回落程序化绘制） */
  fighter(charId: string, anim: string, frame: number): SpriteFrame | null;
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

export function spriteFor(charId: string, anim: string, frame: number): SpriteFrame | null {
  if (!provider) return null;
  return provider.fighter(charId, anim, frame);
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
