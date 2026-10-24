/**
 * 自绘贴图的加载入口。
 *
 * 素材由 `scripts/sprites/build-kyo.mjs` 生成（抠图/统一缩放/量化/打包），
 * 运行时只做两件事：拿 JSON、等图片解码完，然后塞给 `setAssetProvider()`。
 * **拿不到就什么都不做**——绘制层会继续用程序化骨架，游戏照常能玩。
 */
import { frameListProvider, type AssetProvider, type SpriteFrame } from './assets';

/** 图集里一帧的矩形 + 相对角色原点的偏移（都以逻辑像素为单位） */
export interface SheetFrameJson {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export interface SheetJson {
  image: string;
  width: number;
  height: number;
  /** 一个源像素等于多少世界单位（贴图分辨率高于逻辑尺寸时 < 1） */
  scale?: number;
  anims: Record<string, SheetFrameJson[]>;
  /** 同 layout 的纯白剪影帧（受击闪白），可以没有 */
  flash?: Record<string, SheetFrameJson[]>;
}

function rectsAreValid(sets: Record<string, SheetFrameJson[]>): boolean {
  for (const list of Object.values(sets)) {
    if (!Array.isArray(list)) return false;
    for (const f of list) {
      if (typeof f !== 'object' || f === null) return false;
      const rec = f as unknown as Record<string, unknown>;
      for (const k of ['x', 'y', 'w', 'h', 'ox', 'oy'] as const) {
        if (typeof rec[k] !== 'number') return false;
      }
    }
  }
  return true;
}

/** 校验 JSON 形状；不合格直接拒绝（宁可回落程序化，也不要画出错位的图） */
export function isSheetJson(value: unknown): value is SheetJson {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SheetJson>;
  if (typeof v.image !== 'string' || typeof v.width !== 'number' || typeof v.height !== 'number') return false;
  if (v.scale !== undefined && (typeof v.scale !== 'number' || !(v.scale > 0))) return false;
  if (typeof v.anims !== 'object' || v.anims === null) return false;
  if (!rectsAreValid(v.anims)) return false;
  if (v.flash !== undefined && (typeof v.flash !== 'object' || v.flash === null || !rectsAreValid(v.flash))) {
    return false;
  }
  return true;
}

function toFrames(
  image: CanvasImageSource,
  sets: Record<string, SheetFrameJson[]>,
  k: number,
  silhouette = false,
): Record<string, SpriteFrame[]> {
  const out: Record<string, SpriteFrame[]> = {};
  for (const [anim, list] of Object.entries(sets)) {
    out[anim] = list.map((f) => ({
      image,
      sx: f.x,
      sy: f.y,
      sw: f.w,
      sh: f.h,
      // 偏移也存的是源像素，换回世界单位
      offsetX: f.ox * k,
      offsetY: f.oy * k,
      ...(k !== 1 ? { sizeScale: k } : {}),
      ...(silhouette ? { silhouette: true } : {}),
    }));
  }
  return out;
}

/** JSON + 已解码的图片 → `AssetProvider`（纯函数，方便测试） */
export function providerFromSheetJson(charId: string, image: CanvasImageSource, json: SheetJson): AssetProvider {
  const k = json.scale ?? 1;
  return frameListProvider({
    [charId]: {
      image,
      frames: toFrames(image, json.anims, k),
      flashFrames: toFrames(image, json.flash ?? {}, k, true),
    },
  });
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`贴图加载失败：${url}`));
    img.src = url;
  });
}

/**
 * 加载一个角色的贴图。
 *
 * @param charId 角色 id（对得上 `CharDef.id` 才会被用到）
 * @param jsonUrl 图集描述地址
 * @returns 失败返回 null，**不抛**——素材是可选增强，不能把游戏卡在加载上
 */
export async function loadCharSheet(charId: string, jsonUrl: string): Promise<AssetProvider | null> {
  try {
    const res = await fetch(jsonUrl);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isSheetJson(json)) return null;
    const imageUrl = new URL(json.image, new URL(jsonUrl, window.location.href)).href;
    const image = await decodeImage(imageUrl);
    return providerFromSheetJson(charId, image, json);
  } catch {
    return null;
  }
}
