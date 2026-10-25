/**
 * 标题画面插图：`art-source/title/*.png` → `public/title/backdrop.png`
 *
 * 只做两件事：
 * 1. 裁掉最底部一条（元宝的水印在右下角，正好在那一带）；
 * 2. 缩到 640 宽（屏幕上铺满 320 逻辑像素 × 2 倍，够清晰又不浪费）。
 *
 * 用法：node scripts/sprites/build-title.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { crop, decodePng, encodePng, resizeArea } from './png.mjs';

const RAW = 'art-source/title';
const OUT = 'public/title';
const TARGET_W = 640;
/** 底部裁掉的比例：水印在最下面，顺便让构图更聚焦 */
const CROP_BOTTOM = 0.08;

if (!existsSync(RAW)) {
  console.error(`没有原始标题图：${RAW}`);
  process.exit(1);
}
const file = readdirSync(RAW).filter((f) => f.endsWith('.png')).sort()[0];
if (!file) {
  console.error(`${RAW} 是空的`);
  process.exit(1);
}

const img = decodePng(readFileSync(join(RAW, file)));
const keepH = Math.round(img.height * (1 - CROP_BOTTOM));
const cut = crop(img, 0, 0, img.width, keepH);
const w = TARGET_W;
const h = Math.round((keepH / img.width) * w);
const scaled = resizeArea(cut, w, h);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'backdrop.png'), encodePng(scaled));
console.log(`标题插图：${img.width}×${img.height} → 裁底 ${Math.round(CROP_BOTTOM * 100)}% → ${w}×${h}`);
