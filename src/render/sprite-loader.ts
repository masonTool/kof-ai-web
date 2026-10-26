/**
 * 自绘贴图的加载入口。
 *
 * 素材由 `scripts/sprites/build-kyo.mjs` 生成（抠图/统一缩放/量化/打包），
 * 运行时只做两件事：拿 JSON、等图片解码完，然后塞给 `setAssetProvider()`。
 * **拿不到就什么都不做**——绘制层会继续用程序化骨架，游戏照常能玩。
 */
import { frameListProvider, setAssetProvider, type AssetProvider, type SpriteFrame } from './assets';

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

// ---------- 多角色图集：按需加载 + 合并成一个 provider ----------

/** 已装好的角色图集（charId → provider） */
/**
 * 每个角色两片：`main`（站架/移动/防御/轻攻击，首屏必须先到）与 `extra`（跳跃/必杀/
 * 重攻击/胜利姿势，后台补）。合起来才是完整的 33 个动画——
 * 分片的目的是把首屏从 1.85MB 压到 0.91MB（线上 CDN 冷缓存 20~30 秒），不是减少总量。
 */
interface SheetEntry {
  main: AssetProvider;
  extra: AssetProvider | null;
}
const sheets = new Map<string, SheetEntry>();
/** 正在加载中的请求（同一角色只发一次） */
const pending = new Map<string, Promise<void>>();
const extraPending = new Map<string, Promise<void>>();
/** 同时在内存里最多保留几个角色的图集（一张约 1.7MB，全装 40+MB 太浪费） */
const MAX_LOADED = 8;
/** 最近使用顺序，用于淘汰 */
const lru: string[] = [];

function baseUrl(): string {
  return import.meta.env.BASE_URL ?? '/';
}

function touch(charId: string): void {
  const i = lru.indexOf(charId);
  if (i >= 0) lru.splice(i, 1);
  lru.push(charId);
  while (lru.length > MAX_LOADED) {
    const drop = lru.shift();
    if (drop) sheets.delete(drop);
  }
}

/**
 * 装一个"多角色 provider"：查表而已，没装的角色返回 null（回落程序化绘制）。
 *
 * 这样切换对局只需要 `ensureCharSheets()` 把新上场的 6 个人装进来，
 * 不用重建 provider、也不用通知渲染层。
 */
export function installSheetProvider(): void {
  setAssetProvider({
    fighter(charId: string, anim: string, frame: number, flash = false): SpriteFrame | null {
      const entry = sheets.get(charId);
      if (!entry) return null;
      touch(charId);
      return entry.main.fighter(charId, anim, frame, flash) ?? entry.extra?.fighter(charId, anim, frame, flash) ?? null;
    },
  });
}

/**
 * 后台补扩展片（跳跃/必杀/重攻击/胜利姿势）。
 *
 * 和 `ensureCharSheets` 分开放：主片决定"能不能出画面"，必须有；
 * 扩展片晚到只是某些动作短暂回落程序化，**不阻塞开局**。
 */
export async function ensureCharExtras(
  charIds: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  const bump = (): void => {
    done++;
    onProgress?.(done, charIds.length);
  };
  const jobs = charIds.map(async (charId) => {
    const entry = sheets.get(charId);
    if (!entry || entry.extra) {
      bump();
      return;
    }
    const running = extraPending.get(charId);
    if (running) return running;
    const job = (async () => {
      const extra = await withSlot(() =>
        loadCharSheet(charId, `${baseUrl()}sheets/${charId}-extra.json`),
      );
      const cur = sheets.get(charId);
      if (extra && cur) sheets.set(charId, { main: cur.main, extra });
      bump();
    })();
    extraPending.set(charId, job);
    try {
      await job;
    } finally {
      extraPending.delete(charId);
    }
  });
  await Promise.all(jobs);
}

/** 扩展片是否已装（测试用） */
export function hasExtraSheet(charId: string): boolean {
  return sheets.get(charId)?.extra != null;
}

/** 某个角色的图集是否已经装好（测试/调试用） */
export function hasSheet(charId: string): boolean {
  return sheets.has(charId);
}

/** 当前装了几个角色 */
export function loadedSheetCount(): number {
  return sheets.size;
}

/**
 * 确保这些角色的图集可用。
 *
 * 只加载场上这 6 个人，而且失败静默（没有素材的角色继续走程序化）。
 * 返回的 Promise 在本批全部结束（成功或失败）后 resolve。
 */
/** 同时在飞的图集请求上限（线上实测 6 路并发会互相拖慢，单张从 2 秒变成 20~30 秒） */
const MAX_PARALLEL = 2;

/** 简单信号量：限制并发，避免大文件互抢带宽 */
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (inFlight >= MAX_PARALLEL) await new Promise((r) => setTimeout(r, 30));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
  }
}
let inFlight = 0;

/** 某个角色的贴图是不是已经可用（渲染层用来决定画不画"加载中"） */
export function sheetReady(charId: string): boolean {
  return sheets.has(charId);
}

export async function ensureCharSheets(
  charIds: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  const bump = (): void => {
    done++;
    onProgress?.(done, charIds.length);
  };
  const jobs = charIds.map(async (charId) => {
    if (sheets.has(charId)) {
      touch(charId);
      bump();
      return;
    }
    const running = pending.get(charId);
    if (running) return running;
    const job = (async () => {
      const provider = await withSlot(() => loadCharSheet(charId, `${baseUrl()}sheets/${charId}.json`));
      if (provider) {
        const prev = sheets.get(charId);
        sheets.set(charId, { main: provider, extra: prev?.extra ?? null });
        touch(charId);
      }
      bump();
    })();
    pending.set(charId, job);
    try {
      await job;
    } finally {
      pending.delete(charId);
    }
  });
  await Promise.all(jobs);
}
