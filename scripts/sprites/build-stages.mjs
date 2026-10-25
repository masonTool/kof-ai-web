/**
 * 把元宝出的舞台底图处理成游戏用的 `public/stages/<id>.png`。
 *
 * 处理只有一件事：**按屏幕高度归一**。
 * 底图是画在"屏幕坐标"里的（不随镜头缩放，只有视差横移），所以它只需要：
 *   高度 = 224 逻辑像素 × 2（烘大一点，屏幕上别糊）
 * 宽度按原图比例走（约 535 逻辑像素，够覆盖视差的最大横移）。
 *
 * 右下角的平台水印不用管：运行时最下面那条地面色带会盖住它（水印正好落在那里）。
 *
 * 用法：node scripts/sprites/build-stages.mjs [--only skyline]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng, resizeArea } from './png.mjs';

const RAW = 'art-source/stages';
const OUT = 'public/stages';
/** 逻辑像素高 224，烘 2 倍（屏幕上 224 逻辑像素 ≈ 1344 物理像素，原图就那么大，再高没有意义） */
const TARGET_H = 448;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
if (!existsSync(RAW)) {
  console.error(`没有原始底图：${RAW}（先跑 node scripts/sprites/gen-stages.mjs）`);
  process.exit(1);
}

const ids = readdirSync(RAW).filter((d) => (only ? only.includes(d) : true));
mkdirSync(OUT, { recursive: true });
let n = 0;

for (const id of ids) {
  const dir = join(RAW, id);
  const file = readdirSync(dir).filter((f) => f.endsWith('.png')).sort()[0];
  if (!file) {
    console.log(`跳过 ${id}（目录是空的）`);
    continue;
  }
  const img = decodePng(readFileSync(join(dir, file)));
  const h = TARGET_H;
  const w = Math.round((img.width / img.height) * h);
  const scaled = resizeArea(img, w, h);
  writeFileSync(join(OUT, `${id}.png`), encodePng(scaled));
  console.log(`${id}: ${img.width}×${img.height} → ${w}×${h}`);
  n += 1;
}
console.log(`舞台底图：${n} 张 → ${OUT}/`);
