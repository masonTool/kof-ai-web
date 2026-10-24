/**
 * 把元宝出的原始图（public/sheets/kyo-raw/）处理成游戏能直接用的贴图：
 *
 *   抠背景 → 去水印 → 统一缩放（同一个 scale，所有帧身高一致）
 *   → 统一色板量化（所有帧共用一套颜色，跨帧不串色）→ 打包成图集 + JSON
 *
 * 输出的 JSON 是"每帧自带矩形和偏移"的形式，运行时不用算布局：
 *   public/sheets/kyo.png   图集
 *   public/sheets/kyo.json  { image, anims: { idle: [{x,y,w,h,ox,oy}...] } }
 *
 * 用法：node scripts/sprites/build-kyo.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createImage, decodePng, encodePng, blit } from './png.mjs';
import { cutout, scaleToHeight, scaleToWidth } from './cutout.mjs';

const RAW = 'art-source/kyo-raw';
const OUT_IMAGE = 'public/sheets/kyo.png';
const OUT_JSON = 'public/sheets/kyo.json';

/** 角色身高（逻辑像素）：跟程序化绘制的京同高，站上去才对得上判定盒 */
const CHAR_H = 84;

/**
 * 动画 → 帧序列。
 *
 * 帧数尽量对齐 `src/render/poses.ts` 里同名姿势的帧数：
 * 运行时下标由 `poseFrameIndex()` 给，帧数少了会自己循环回来（出拳就是"收-出-收"）。
 */
const ANIMS = {
  idle: ['idle/yb-1792861279285-0.png'],
  walkF: [
    'walk/yb-1792861485832-0.png',
    'walk/yb-1792861486055-2.png',
    'walk/yb-1792861485954-1.png',
    'walk/yb-1792861486055-2.png',
  ],
  walkB: ['walk/yb-1792861485832-0.png', 'walk/yb-1792861486055-2.png'],
  guard: ['guard/yb-1792861464030-0.png', 'guard/yb-1792861464030-0.png'],
  crouch: ['crouch2/yb-1792861816158-0.png'],
  jump: ['jump/yb-1792861651568-3.png', 'jump/yb-1792861651412-1.png', 'jump/yb-1792861651568-3.png'],
  punchLight: [
    'punch-windup/yb-1792861418371-0.png',
    'punch/yb-1792861301787-0.png',
    'punch/yb-1792861301787-0.png',
  ],
  punchHeavy: [
    'punch-windup/yb-1792861418563-2.png',
    'punch/yb-1792861301987-2.png',
    'punch/yb-1792861301987-2.png',
  ],
  attack: [
    'punch-windup/yb-1792861418371-0.png',
    'punch/yb-1792861301787-0.png',
    'punch/yb-1792861301787-0.png',
  ],
  kickLight: [
    'kick-windup/yb-1792861440527-0.png',
    'kick/yb-1792861324352-3.png',
    'kick/yb-1792861324352-3.png',
  ],
  kickHeavy: [
    'kick-windup/yb-1792861440822-3.png',
    'kick/yb-1792861324352-3.png',
    'kick/yb-1792861324352-3.png',
  ],
  hit: ['hit/yb-1792861346088-3.png', 'hit/yb-1792861346088-3.png', 'hit/yb-1792861346088-3.png'],
  win: ['win/yb-1792861389316-0.png', 'win/yb-1792861389316-0.png'],
  win2: ['win/yb-1792861389316-0.png', 'win/yb-1792861389316-0.png'],
  win3: ['win/yb-1792861389524-2.png', 'win/yb-1792861389524-2.png'],
  // 躺在地上：按"宽度"归一，锚点用包围盒中心（横躺的人没有"脚底"这个概念）
  down: ['down/yb-1792861368088-3.png'],
};

/** 这些动画按宽度归一 + 水平居中（横躺姿势） */
const LYING = new Set(['down']);

/**
 * 少数姿势要单独定身高。
 *
 * 蹲姿原图只比站姿矮一点点（AI 画不出"矮一大截"），但游戏里蹲下必须明显变矮，
 * 否则高段位的拳看起来会打在头上。这里按姿势库里 CROUCH 的头高比例（54/71）压到 64。
 */
const HEIGHT_OVERRIDE = { crouch: 64 };

function loadRaw(rel) {
  const path = join(RAW, rel);
  if (!existsSync(path)) throw new Error(`找不到原始图 ${path}`);
  return cutout(decodePng(readFileSync(path))).img;
}

/**
 * 帧内色板：把这帧自己的高频颜色抽出来。
 *
 * 试过"所有帧共用一份 28/64 色板"，会出事：白衣的暗部在整份色板里最近的邻居
 * 往往是墨绿裤子的中绿，于是白衣服上会被点出一道道绿色。帧内取色就不会——
 * 那件白衣的暗部就长在这帧自己身上，一定在色板里。
 */
function framePalette(img, maxColors = 24) {
  const buckets = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 200) continue;
    const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
    let b = buckets.get(key);
    if (!b) {
      b = [0, 0, 0, 0];
      buckets.set(key, b);
    }
    b[0] += img.data[i];
    b[1] += img.data[i + 1];
    b[2] += img.data[i + 2];
    b[3] += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => b[3] - a[3])
    .slice(0, maxColors)
    .map((b) => [Math.round(b[0] / b[3]), Math.round(b[1] / b[3]), Math.round(b[2] / b[3])]);
}

function quantize(img, palette) {
  const cache = new Map();
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const key = ((out.data[i] >> 2) << 12) | ((out.data[i + 1] >> 2) << 6) | (out.data[i + 2] >> 2);
    let pick = cache.get(key);
    if (pick === undefined) {
      let best = 0;
      let bestD = Infinity;
      for (let p = 0; p < palette.length; p++) {
        const dr = out.data[i] - palette[p][0];
        const dg = out.data[i + 1] - palette[p][1];
        const db = out.data[i + 2] - palette[p][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      cache.set(key, best);
      pick = best;
    }
    out.data[i] = palette[pick][0];
    out.data[i + 1] = palette[pick][1];
    out.data[i + 2] = palette[pick][2];
  }
  return out;
}

/** 腿部质心当水平锚点：出拳/踢腿时上身和手臂会甩出去，腿是唯一稳的参考 */
function legAnchorX(img) {
  const yStart = Math.floor(img.height * 0.72);
  let sum = 0;
  let n = 0;
  for (let y = yStart; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      sum += x;
      n++;
    }
  }
  return n === 0 ? img.width / 2 : sum / n;
}

// ---------- 主流程 ----------
const raws = new Map();
for (const list of Object.values(ANIMS)) {
  for (const rel of list) if (!raws.has(rel)) raws.set(rel, loadRaw(rel));
}
// 统一 scale：以 idle 第一帧的身高为"角色身高"
const refRel = ANIMS.idle[0];
const refH = raws.get(refRel).height;
const scale = CHAR_H / refH;

const frames = {};
for (const [anim, list] of Object.entries(ANIMS)) {
  const lying = LYING.has(anim);
  const targetH = HEIGHT_OVERRIDE[anim];
  frames[anim] = list.map((rel) => {
    const raw = raws.get(rel);
    const sized = lying
      ? scaleToWidth(raw, Math.round(CHAR_H * 1.05))
      : targetH !== undefined
        ? scaleToHeight(raw, targetH)
        : scaleToHeight(raw, Math.round(raw.height * scale));
    const img = quantize(sized, framePalette(sized));
    const ox = -Math.round(lying ? img.width / 2 : legAnchorX(img));
    const rect = { w: img.width, h: img.height, ox, oy: -img.height };
    // 剪影：同一形状整片刷白，受击闪白时直接贴这一帧（比盖白方块干净得多）
    const sil = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
    for (let i = 0; i < sil.data.length; i += 4) {
      if (sil.data[i + 3] === 0) continue;
      sil.data[i] = 255;
      sil.data[i + 1] = 255;
      sil.data[i + 2] = 255;
      sil.data[i + 3] = 255;
    }
    return { img, sil, rect: { ...rect } };
  });
}

// ---------- 打包：简单货架（宽高都不大，够用） ----------
const MAX_W = 1024;
const order = [];
for (const [anim, list] of Object.entries(frames)) {
  for (const f of list) order.push({ anim, kind: 'normal', img: f.img, rect: { ...f.rect } });
  for (const f of list) order.push({ anim, kind: 'flash', img: f.sil, rect: { ...f.rect } });
}
let shelfX = 0;
let shelfY = 0;
let shelfH = 0;
for (const f of order) {
  if (shelfX + f.rect.w > MAX_W) {
    shelfX = 0;
    shelfY += shelfH + 1;
    shelfH = 0;
  }
  f.rect.x = shelfX;
  f.rect.y = shelfY;
  shelfX += f.rect.w + 1;
  shelfH = Math.max(shelfH, f.rect.h);
}
const atlasW = MAX_W;
const atlasH = shelfY + shelfH;

const atlas = createImage(atlasW, atlasH);
for (const f of order) blit(atlas, f.img, f.rect.x, f.rect.y);

writeFileSync(OUT_IMAGE, encodePng(atlas));

const animsJson = {};
const flashJson = {};
const pick = (f) => ({ x: f.rect.x, y: f.rect.y, w: f.rect.w, h: f.rect.h, ox: f.rect.ox, oy: f.rect.oy });
for (const [anim, list] of Object.entries(frames)) {
  animsJson[anim] = order.filter((o) => o.anim === anim && o.kind === 'normal').map(pick);
  flashJson[anim] = order.filter((o) => o.anim === anim && o.kind === 'flash').map(pick);
  if (animsJson[anim].length === 0) throw new Error(`动画 ${anim} 一帧都没有`);
  void list;
}
writeFileSync(
  OUT_JSON,
  JSON.stringify({ image: 'kyo.png', width: atlasW, height: atlasH, anims: animsJson, flash: flashJson }, null, 1),
);

console.log(`缩放 ${scale.toFixed(4)} · 图集 ${atlasW}×${atlasH}`);
for (const [anim, list] of Object.entries(frames)) {
  console.log(`  ${anim.padEnd(11)} ${list.length} 帧  ${list.map((f) => `${f.rect.w}×${f.rect.h}`).join(' ')}`);
}
