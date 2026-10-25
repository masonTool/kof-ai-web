/**
 * 把「选人半身像」的原始出图（洋红底）处理成可直接用的透明 PNG。
 *
 * 流程：原图 → 抠洋红底 → 裁到人物包围盒 → 等比缩放到 480×640 内 → public/selportraits/
 *
 * 用法：node scripts/sprites/build-selportraits.mjs [--only kyo,iori]
 * 依赖：先跑 `gen-select-portraits.mjs` 出图
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cutout } from './cutout.mjs';
import { createImage, decodePng, encodePng, resizeArea, blit } from './png.mjs';

const SRC = 'art-source/selportraits';
const OUT = 'public/selportraits';
/** 选人屏大特写区按这个比例出图（宽:高 = 3:4），绘制时再按实际框等比缩放 */
const TARGET_W = 480;
const TARGET_H = 640;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (!existsSync(SRC)) {
  console.error(`没有原始出图目录：${SRC}（先跑 gen-select-portraits.mjs）`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const ids = readdirSync(SRC).filter((d) => !only || only.includes(d));

let built = 0;
const skipped = [];
for (const id of ids) {
  const dir = join(SRC, id);
  const raw = readdirSync(dir).find((f) => f.endsWith('.png'));
  if (!raw) {
    skipped.push(id);
    continue;
  }
  // cutout() 返回 { img, core }：img 已经裁到人物包围盒，不用再算 alphaBounds
  let img;
  try {
    ({ img } = cutout(decodePng(readFileSync(join(dir, raw)))));
  } catch {
    skipped.push(id);
    continue;
  }
  if (img.width < 8 || img.height < 8) {
    skipped.push(id);
    continue;
  }
  // 按高度缩到目标高度，宽度按比例（人物本身比例不动，不拉伸）
  const w = Math.max(1, Math.round((img.width * TARGET_H) / img.height));
  const scaled = resizeArea(img, w, TARGET_H);
  // 画布固定 480×640，人物水平居中（超出就裁两侧，保证不同角色观感一致）
  const canvas = createImage(TARGET_W, TARGET_H);
  const ox = Math.round((TARGET_W - w) / 2);
  blit(canvas, scaled, ox, 0);
  writeFileSync(join(OUT, `${id}.png`), encodePng(canvas));
  built++;
  console.log(`· ${id} → ${TARGET_W}×${TARGET_H}（人物 ${img.width}×${img.height}）`);
}

console.log(
  skipped.length === 0
    ? `\n完成 ${built} 张半身像 → ${OUT}/`
    : `\n完成 ${built} 张；跳过：${skipped.join(', ')}（没出图或抠图失败）`,
);
