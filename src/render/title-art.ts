/**
 * 标题插图：`public/title/backdrop.png`（一张就够，非阻塞预载）。
 * 拿不到就回落标题屏原来的横条底纹——标题画面永远能看。
 */

export interface TitleArt {
  image: CanvasImageSource;
  width: number;
  height: number;
}

let art: TitleArt | null = null;
let requested = false;

function baseUrl(): string {
  return import.meta.env?.BASE_URL ?? '/';
}

/** 开始加载（重复调用无害） */
export function ensureTitleArt(): void {
  if (requested || typeof Image === 'undefined') return;
  requested = true;
  const img = new Image();
  img.onload = () => {
    art = { image: img, width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
  };
  img.src = `${baseUrl()}title/backdrop.png`;
}

export function titleArt(): TitleArt | null {
  return art;
}

/** 测试用 */
export function resetTitleArt(): void {
  art = null;
  requested = false;
}
