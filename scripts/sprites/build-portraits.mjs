/**
 * 从角色图集里裁头像（`public/portraits/<id>.png`）。
 *
 * 为什么不另出一套头像：
 * - 图集里已经有同一张脸、同一套画风，裁出来天然和战斗画面一致；
 * - 单独再出 26 张要 25 分钟 API，还会有"头像和游戏里不是一个人"的风险。
 *
 * 做法：取 idle 帧，在画面上部找"头的包围盒"（不透明像素），
 * 按头部中心裁一个正方形（带一点肩），再面积缩放成 128×128。
 *
 * 用法：node scripts/sprites/build-portraits.mjs [--only kyo,iori]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { crop, decodePng, encodePng, createImage, resizeArea, blit } from './png.mjs';

const SHEETS = 'public/sheets';
/**
 * 变体角色没有自己的图集（暴走八神/暴走莉安娜是同一个人的异色形态），
 * 头像先借用本体的；颜色差异留给运行时 tint（见 T161）。
 */
const ALIAS = {
  orochi_iori: 'iori',
  orochi_leona: 'leona',
};

/**
 * 变体头像的染色（和 `build-sheet.mjs --tint` 同一套公式，颜色才一致）：
 * 只染中间调，纯黑描边和白高光保持原样。
 */
const TINT = {
  orochi_iori: [255, 50, 40],
  orochi_leona: [150, 70, 255],
};

function tintPixels(img, tint) {
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const lum = (0.299 * out.data[i] + 0.587 * out.data[i + 1] + 0.114 * out.data[i + 2]) / 255;
    const k = 0.62 * Math.max(0, 1 - Math.abs(lum - 0.45) * 2.1);
    out.data[i] = Math.round(out.data[i] * (1 - k) + tint[0] * k);
    out.data[i + 1] = Math.round(out.data[i + 1] * (1 - k) + tint[1] * k);
    out.data[i + 2] = Math.round(out.data[i + 2] * (1 - k) + tint[2] * k);
  }
  return out;
}
const OUT = 'public/portraits';
/** 头像边长（源像素缩放到这个尺寸） */
const SIZE = 128;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * 在图集里找"头部"的包围盒。
 *
 * 判据：从帧顶往下扫，取前 32% 高度内的不透明像素范围。
 * 这段一定是头（头发最蓬的角色也不会超过 32%），肩膀以下的部分不要，
 * 否则头像会变成"半身像缩小版"，在 32px 的格子里看不清五官。
 */
function headBox(atlas, frame) {
  const bandTop = frame.y;
  const bandBottom = frame.y + Math.max(1, Math.round(frame.h * 0.32));
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  for (let y = bandTop; y < bandBottom; y++) {
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const a = atlas.data[(y * atlas.width + x) * 4 + 3];
      if (a < 128) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  // 取"高和宽里更大的那个"做正方形，再往外放 12% 留出头发边缘
  const side = Math.round(Math.max(w, h) * 1.12);
  const cx = (minX + maxX) / 2;
  const top = Math.min(minY, frame.y);
  return {
    x: Math.round(cx - side / 2),
    y: Math.round(top - side * 0.06),
    w: side,
    h: side,
  };
}

/** 越界的部分用透明补齐（头贴着画面顶端时很常见） */
function cropPadded(img, box) {
  const out = createImage(box.w, box.h);
  for (let y = 0; y < box.h; y++) {
    const sy = box.y + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < box.w; x++) {
      const sx = box.x + x;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (y * box.w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const sheets = readdirSync(SHEETS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .filter((id) => (only ? only.includes(id) : true))
  .sort();

if (sheets.length === 0) {
  console.error('没有找到任何图集，先跑 npm run art:all');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
let done = 0;
const skipped = [];

for (const id of sheets) {
  const json = JSON.parse(readFileSync(join(SHEETS, `${id}.json`), 'utf8'));
  const atlas = decodePng(readFileSync(join(SHEETS, `${id}.png`)));
  const frame = json.anims?.idle?.[0];
  if (!frame) {
    skipped.push(`${id}:没有 idle 帧`);
    continue;
  }
  const box = headBox(atlas, frame);
  if (!box) {
    skipped.push(`${id}:idle 帧是空的`);
    continue;
  }
  const head = cropPadded(atlas, box);
  const scaled = resizeArea(head, SIZE, SIZE);
  // 放到正方形画布中央，坐标统一好排（选人格子直接按边长画）
  const canvas = createImage(SIZE, SIZE);
  blit(canvas, scaled, 0, 0);
  writeFileSync(join(OUT, `${id}.png`), encodePng(canvas));
  done += 1;
}

// 变体：借本体的头像，再按同一套公式染色
for (const [variant, base] of Object.entries(ALIAS)) {
  try {
    const src = decodePng(readFileSync(join(OUT, `${base}.png`)));
    const tinted = TINT[variant] ? tintPixels(src, TINT[variant]) : src;
    writeFileSync(join(OUT, `${variant}.png`), encodePng(tinted));
    done += 1;
  } catch {
    skipped.push(`${variant}:本体 ${base} 的头像还没生成`);
  }
}

console.log(`头像：${done} 个 → ${OUT}/（${SIZE}×${SIZE}）`);
if (skipped.length) console.log(`跳过：${skipped.join('；')}`);
