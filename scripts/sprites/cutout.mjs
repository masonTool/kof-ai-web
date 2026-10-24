/**
 * 抠图：从"纯洋红/纯绿幕"背景的 AI 出图里把角色切出来。
 *
 * 为什么不用"颜色等于 #FF00FF 就透明"：AI 出的背景不是纯色，
 * 四角采样能差 40 个色阶；而且右下角有平台水印，单纯按颜色删会连水印一起留下。
 * 所以走两条：**从边界泛洪**（只删连通到画布外的背景）＋ **最大连通块**
 * （水印是独立的小岛，直接被丢掉）。
 */
import { createImage, crop, getPixel, resizeArea, blit } from './png.mjs';

function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** 取四边一圈的中位色当背景色 */
function borderColor(img) {
  const samples = [];
  const step = Math.max(1, Math.floor(img.width / 64));
  for (let x = 0; x < img.width; x += step) {
    samples.push(getPixel(img, x, 0), getPixel(img, x, img.height - 1));
  }
  for (let y = 0; y < img.height; y += step) {
    samples.push(getPixel(img, 0, y), getPixel(img, img.width - 1, y));
  }
  const med = (i) => {
    const v = samples.map((s) => s[i]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  return [med(0), med(1), med(2)];
}

/**
 * 泛洪抠色。
 * @returns {{img:{width:number,height:number,data:Uint8Array}, bg:number[], removed:number}}
 */
export function keyBackground(img, { tol = 72, fringe = 130 } = {}) {
  const bg = borderColor(img);
  const w = img.width;
  const h = img.height;
  const out = { width: w, height: h, data: new Uint8Array(img.data) };
  const seen = new Uint8Array(w * h);
  const stack = [];
  const tol2 = tol * tol;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i]) return;
    const p = getPixel(img, x, y);
    if (dist2(p, bg) > tol2) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  let removed = 0;
  while (stack.length > 0) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    out.data[i * 4 + 3] = 0;
    removed++;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // 边缘残影：贴着透明区的洋红色像素也一并删掉，否则缩小时会渗出一圈粉边
  const fringe2 = fringe * fringe;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (seen[i]) continue;
      const p = getPixel(img, x, y);
      if (dist2(p, bg) > fringe2) continue;
      const nearBg =
        (x > 0 && seen[i - 1]) ||
        (x < w - 1 && seen[i + 1]) ||
        (y > 0 && seen[i - w]) ||
        (y < h - 1 && seen[i + w]);
      if (nearBg) out.data[i * 4 + 3] = 0;
    }
  }
  return { img: out, bg, removed };
}

/**
 * 删掉被角色"围住"的背景（比如手臂和身体之间夹的那块洋红）。
 *
 * 泛洪只能删连通到画布外的背景，夹住的删不到；但夹住的那块**颜色就是背景色**，
 * 而角色身上（白衣/墨绿裤/肤色/黑发）没有这个颜色，所以按"整块颜色都极接近背景色"判定。
 */
export function removeEnclosedBg(img, bg, { tol = 56, meanTol = 34, minPixels = 24 } = {}) {
  const w = img.width;
  const h = img.height;
  const out = { width: w, height: h, data: new Uint8Array(img.data) };
  const cand = new Uint8Array(w * h);
  const tol2 = tol * tol;
  for (let i = 0; i < w * h; i++) {
    if (out.data[i * 4 + 3] === 0) continue;
    cand[i] = dist2(getPixel(img, i % w, (i / w) | 0), bg) <= tol2 ? 1 : 0;
  }
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (cand[start] === 0 || seen[start] === 1) continue;
    const pixels = [];
    const stack = [start];
    seen[start] = 1;
    let sum = 0;
    while (stack.length > 0) {
      const i = stack.pop();
      pixels.push(i);
      sum += dist2(getPixel(img, i % w, (i / w) | 0), bg);
      const x = i % w;
      const y = (i / w) | 0;
      const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const n of near) {
        if (n < 0 || cand[n] === 0 || seen[n] === 1) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (pixels.length < minPixels) continue;
    if (Math.sqrt(sum / pixels.length) > meanTol) continue; // 是角色身上的红色/粉色细节，留着
    for (const i of pixels) out.data[i * 4 + 3] = 0;
  }
  return out;
}

/** 保留最大连通块，其余（水印、碎点）清空 */
export function keepLargestComponent(img, { minPixels = 400 } = {}) {
  const w = img.width;
  const h = img.height;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || img.data[start * 4 + 3] === 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const i = stack.pop();
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      const near = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const n of near) {
        if (n < 0 || label[n] !== -1 || img.data[n * 4 + 3] === 0) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    sizes.push(size);
  }
  let best = -1;
  let bestSize = minPixels;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] > bestSize) {
      bestSize = sizes[i];
      best = i;
    }
  }
  const out = { width: w, height: h, data: new Uint8Array(img.data) };
  for (let i = 0; i < w * h; i++) {
    if (label[i] !== best) out.data[i * 4 + 3] = 0;
  }
  return out;
}

/** 不透明像素的包围盒；全透明返回 null */
export function alphaBounds(img) {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 把一张原始出图处理成"角色紧凑图"：抠背景 → 丢水印 → 按包围盒裁剪。
 * @returns {{img:object, core:{x:number,y:number,w:number,h:number}}}
 */
export function cutout(buf) {
  const { img, bg } = keyBackground(buf);
  const solid = keepLargestComponent(removeEnclosedBg(img, bg));
  const box = alphaBounds(solid);
  if (!box) throw new Error('抠完什么都没有');
  return { img: crop(solid, box.x0, box.y0, box.w, box.h), core: box };
}

/** 缩放到指定高度（面积平均），返回新图 */
export function scaleToHeight(img, height) {
  const w = Math.max(1, Math.round((img.width * height) / img.height));
  return resizeArea(img, w, height);
}

/** 缩放到指定宽度（面积平均），返回新图 */
export function scaleToWidth(img, width) {
  const h = Math.max(1, Math.round((img.height * width) / img.width));
  return resizeArea(img, width, h);
}

/** 贴到固定画布：水平居中于 `centerX`，底边落在 `baselineY` */
export function placeInCell(frame, cellW, cellH, centerX, baselineY) {
  const canvas = createImage(cellW, cellH);
  const dx = Math.round(centerX - frame.width / 2);
  const dy = Math.round(baselineY - frame.height);
  blit(canvas, frame, dx, dy);
  return canvas;
}
