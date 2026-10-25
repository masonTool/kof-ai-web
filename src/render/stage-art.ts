/**
 * 舞台底图：`public/stages/<id>.png`（横版全景，只当最远层用）。
 *
 * 和人物头像一样的策略：**非阻塞预载 + 拿不到就回落程序化背景**。
 * 底图缺一张不影响任何玩法，只是那条舞台的远景变回几何色块。
 */

export interface StageArt {
  image: CanvasImageSource;
  /** 原图像素尺寸（绘制时要按它算 cover 缩放，不能写死） */
  width: number;
  height: number;
}

const cache = new Map<string, StageArt>();
const pending = new Set<string>();

function baseUrl(): string {
  return import.meta.env?.BASE_URL ?? '/';
}

function canLoad(): boolean {
  return typeof Image !== 'undefined';
}

/** 预载舞台底图（重复调用无害） */
export function ensureStageArt(ids: readonly string[]): void {
  if (!canLoad()) return;
  for (const id of ids) {
    if (cache.has(id) || pending.has(id)) continue;
    pending.add(id);
    const img = new Image();
    img.onload = () => {
      pending.delete(id);
      cache.set(id, { image: img, width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    };
    img.onerror = () => pending.delete(id);
    img.src = `${baseUrl()}stages/${id}.png`;
  }
}

export function stageArtFor(id: string): StageArt | null {
  return cache.get(id) ?? null;
}

export function resetStageArt(): void {
  cache.clear();
  pending.clear();
}
