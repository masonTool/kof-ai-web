/**
 * 素材模板导出：把**我们自己程序化画出来的**角色，按标准 sprite sheet 的排布导成一张 PNG。
 *
 * 它解决的问题是"我想照着改，但无从下手"：
 * 导出的图上每个格子就是一个动画的一帧、和 `spriteSheetProvider` 的切图规则完全一致，
 * 你可以直接在图上描线、改脸、改衣服，改完把 PNG 放回项目就能被 `assets.ts` 接管。
 *
 * 注意：导出的内容来自本项目自己的绘制代码，不含任何第三方素材。
 */

export interface SheetSpec {
  /** 动画名 → 帧数（顺序即排布顺序） */
  anims: Record<string, number>;
  /** 每行几帧 */
  columns: number;
  frameW: number;
  frameH: number;
}

/** 整张图要多大 */
export function sheetSize(spec: SheetSpec): { w: number; h: number } {
  const total = Object.values(spec.anims).reduce((s, n) => s + Math.max(0, n), 0);
  const rows = Math.max(1, Math.ceil(total / Math.max(1, spec.columns)));
  return { w: spec.columns * spec.frameW, h: rows * spec.frameH };
}

/** 某个动画第 index 帧在图上的矩形 */
export function frameRect(spec: SheetSpec, anim: string, index: number): { x: number; y: number; w: number; h: number } | null {
  let start = 0;
  for (const [name, count] of Object.entries(spec.anims)) {
    if (name === anim) {
      const i = Math.round(index);
      if (i < 0 || i >= count) return null;
      const cell = start + i;
      const col = cell % spec.columns;
      const row = Math.floor(cell / spec.columns);
      return { x: col * spec.frameW, y: row * spec.frameH, w: spec.frameW, h: spec.frameH };
    }
    start += Math.max(0, count);
  }
  return null;
}

/** 展开成"逐帧任务"，按顺序填格 */
export function sheetCells(spec: SheetSpec): { anim: string; index: number; x: number; y: number }[] {
  const out: { anim: string; index: number; x: number; y: number }[] = [];
  let cell = 0;
  for (const [anim, count] of Object.entries(spec.anims)) {
    for (let i = 0; i < count; i++) {
      out.push({
        anim,
        index: i,
        x: (cell % spec.columns) * spec.frameW,
        y: Math.floor(cell / spec.columns) * spec.frameH,
      });
      cell++;
    }
  }
  return out;
}

/**
 * 在浏览器里画出整张表并返回 canvas（节点环境没有 document，调用方要自己保证）。
 * `paint` 负责把某动画的某一帧画到指定格子里（调用方用 `drawPose` 即可）。
 */
export function renderSheet(
  spec: SheetSpec,
  paint: (ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, anim: string, index: number) => void,
): HTMLCanvasElement {
  const { w, h } = sheetSize(spec);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 棋盘格背景：透明区域一眼能看出来
  for (let y = 0; y < h; y += 8) {
    for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = ((x + y) / 8) % 2 === 0 ? '#2a2d36' : '#22252c';
      ctx.fillRect(x, y, 8, 8);
    }
  }

  for (const cell of sheetCells(spec)) {
    const box = { x: cell.x, y: cell.y, w: spec.frameW, h: spec.frameH };
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    paint(ctx, box, cell.anim, cell.index);
    ctx.restore();
    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  }
  return canvas;
}

/** 触发浏览器下载 */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}
