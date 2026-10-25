/**
 * 人物头像：`public/portraits/<id>.png`（128×128，从角色图集裁出来的胸像）。
 *
 * 为什么单独一层而不是复用 `assets.ts`：
 * 头像和战斗图集的生命周期不一样——选人屏要一次显示 20 多张，
 * 战斗图集一张就 1.7MB，不能为了画头像把 20 多个图集全装进来。头像只有 ~25KB/张。
 *
 * 加载是**非阻塞**的：`ensurePortraits()` 只是丢出请求，画的时候拿不到就先画占位，
 * 图到了下一帧自然出现。节点环境（测试）没有 `Image`，直接当作"没有头像"。
 */

const cache = new Map<string, CanvasImageSource>();
const pending = new Set<string>();

function baseUrl(): string {
  return import.meta.env?.BASE_URL ?? '/';
}

function canLoad(): boolean {
  return typeof Image !== 'undefined';
}

/** 预载一批头像（重复调用无害） */
export function ensurePortraits(ids: readonly string[]): void {
  if (!canLoad()) return;
  for (const id of ids) {
    if (cache.has(id) || pending.has(id)) continue;
    pending.add(id);
    const img = new Image();
    img.onload = () => {
      pending.delete(id);
      cache.set(id, img);
    };
    img.onerror = () => {
      // 没有这张头像：保持 null，绘制层会回落画小人
      pending.delete(id);
    };
    img.src = `${baseUrl()}portraits/${id}.png`;
  }
}

/** 取头像；还没加载好返回 null */
export function portraitFor(id: string): CanvasImageSource | null {
  return cache.get(id) ?? null;
}

/** 已加载数量（测试/调试） */
export function portraitCount(): number {
  return cache.size;
}

/** 清空（测试用） */
export function resetPortraits(): void {
  cache.clear();
  pending.clear();
}

// ── 选人屏大特写（480×640 半身像） ─────────────────────────────────────────
// 和 128×128 小头像分开缓存：大图单张 ~300KB，27 张一次装完是 10MB，
// 线上 CDN 冷缓存会很慢，所以只按需装"当前光标 ±1"这几张。
const bigCache = new Map<string, CanvasImageSource>();
const bigPending = new Set<string>();

/** 预载若干张半身像（重复调用无害；只需要传光标附近的几个） */
export function ensureBigPortraits(ids: readonly string[]): void {
  if (!canLoad()) return;
  for (const id of ids) {
    if (bigCache.has(id) || bigPending.has(id)) continue;
    bigPending.add(id);
    const img = new Image();
    img.onload = () => {
      bigPending.delete(id);
      bigCache.set(id, img);
    };
    img.onerror = () => {
      bigPending.delete(id); // 没有就回落小头像，不报错
    };
    img.src = `${baseUrl()}selportraits/${id}.png`;
  }
}

/** 取半身像；还没加载好返回 null */
export function bigPortraitFor(id: string): CanvasImageSource | null {
  return bigCache.get(id) ?? null;
}
