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
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createImage, decodePng, encodePng, blit } from './png.mjs';
import { cutout, scaleToHeight, scaleToWidth } from './cutout.mjs';

/** 画风：决定读哪一套原始图（与 gen-poses.mjs 的 KYO_STYLE 对应） */
const STYLE = process.env.KYO_STYLE ?? 'ink';
/** 角色 id（--char，默认 kyo）：一套素材一个角色 */
const CHAR_ID = (() => {
  const i = process.argv.indexOf('--char');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'kyo';
})();
const argVal = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
};

const RAW = `art-source/${CHAR_ID}-raw-${STYLE}`;
const OUT_IMAGE = `public/sheets/${CHAR_ID}.png`;
const OUT_JSON = `public/sheets/${CHAR_ID}.json`;

/** 角色身高（逻辑像素）：跟程序化绘制的京同高，站上去才对得上判定盒 */
const CHAR_H = 84;

/**
 * 贴图分辨率：一个逻辑像素烘几个源像素。
 *
 * 屏幕上**一个逻辑像素**占多少物理像素，是窗口大小 + dpr 决定的：
 *   1280×720 窗口 → 整数放大 3 倍，Retina ×2 ⇒ 6 个物理像素/逻辑像素
 *   再叠加渲染层的 `RENDER_SCALE = 2`（后备缓冲超采样）⇒ 光栅化时是 12 个
 * 所以按 8 倍（84×8 = 672px 高）烘：比屏幕实际需要的 6 倍多一点余量，
 * 窗口再大一点也不会立刻糊，图集又没到"打开就卡"的地步（约 1MB）。
 */
const RES = 8;

/** 只有这些动画会被闪白用到（`renderer.ts` 里 Hit 状态前 3 帧），别给所有帧烘剪影，图集受不了 */
const FLASH_ANIMS = new Set(['hit']);

/**
 * 动画 → 帧序列。
 *
 * 帧数尽量对齐 `src/render/poses.ts` 里同名姿势的帧数：
 * 运行时下标由 `poseFrameIndex()` 给，帧数少了会自己循环回来（出拳就是"收-出-收"）。
 */
const ANIMS = {
  idle: ['idle'],
  // 走 4 帧只出了 2 个姿势，循环回来正好是"左右左右"
  walkF: ['walk1', 'walk2', 'walk1', 'walk2'],
  walkB: ['walk2', 'walk1'],
  guard: ['guard', 'guard'],
  crouch: ['crouch'],
  jump: ['jumpup', 'jumpdown', 'jumpup'],
  punchLight: ['punchwindup', 'punchout', 'punchout'],
  punchHeavy: ['punchwindup', 'punchout', 'punchout'],
  kickLight: ['kickwindup', 'kickout', 'kickout'],
  kickHeavy: ['kickwindup', 'kickout', 'kickout'],
  hit: ['hit', 'hit', 'hit'],
  win: ['win', 'win'],
  // 蹲姿攻击：蹲着出拳 / 蹲着扫腿（KOF 的 2A 2B 2C 2D 全靠这两套）
  crouchPunch: ['crouchpunch'],
  crouchKick: ['crouchkick'],
  // 空中攻击（jA jB jC jD）
  jumpAttack: ['jumpattack'],
  // 必杀技：所有必杀/超必杀共用一个起手姿势
  special: ['special'],
  // 躺在地上：按"宽度"归一，锚点用包围盒中心（横躺的人没有"脚底"这个概念）
  down: ['down'],
};

/**
 * 姿势库里没有单独出图的动画 → 借用最接近的那一套。
 *
 * 不借的话，`spriteFor()` 返回 null，绘制层就掉回程序化骨架——
 * 表现就是"格挡一瞬间闪出像素人"。借用的帧直接复用同一块图集区域，不占额外空间。
 */
const ALIAS = {
  attack: 'punchLight', // 默认攻击动画 == 轻拳
  win2: 'win',
  win3: 'win',
  block: 'guard', // 格挡：和"按住防御"是同一个姿势
  landing: 'crouch', // 落地缓冲
  wakeup: 'crouch', // 起身
  hitFall: 'hit', // 被打飞
  taunt: 'win', // 挑衅
  lose: 'hit', // 败北
  dizzy: 'idle', // 眩晕（暂时用站架，将来单独出图）
  roll: 'crouch', // 受身翻滚
  throwStart: 'special', // 投技起手
};

/** 这些动画按宽度归一 + 水平居中（横躺姿势） */
const LYING = new Set(['down']);

/**
 * 少数姿势要单独定身高。
 *
 * 蹲姿原图只比站姿矮一点点（AI 画不出"矮一大截"），但游戏里蹲下必须明显变矮，
 * 否则高段位的拳看起来会打在头上。这里按姿势库里 CROUCH 的头高比例（54/71）压到 64。
 */
const HEIGHT_OVERRIDE = {};

/**
 * 身高上限（世界单位）：算出来的高度超过它就压到它。
 *
 * 头发归一已经能把"画大了"的姿势缩回来，但蹲姿还有第二层问题：
 * 蹲着出拳画得再标准，也可能比真蹲高一截（AI 画的蹲不够低），所以给个宽松的天花板兜底。
 * 值要留足余量：压得太狠会把头也压小，反而破坏"同一张脸"的观感。
 */
const HEIGHT_CAP = { crouch: 66, crouchPunch: 72, crouchKick: 64 };

/**
 * 姿势目录 → 抠好的图。
 *
 * 目录名就是姿势（idle / punchout / kickwindup …），里面放元宝出的候选图，
 * 取文件名排序第一张——挑图时把想要的改成 `00.png` 就行，不用改代码。
 */
const poseCache = new Map();
function loadPose(pose) {
  if (poseCache.has(pose)) return poseCache.get(pose);
  const dir = join(RAW, pose);
  if (!existsSync(dir)) {
    throw new Error(`缺少姿势 ${pose}：${dir}\n  先跑 node scripts/sprites/gen-poses.mjs --only ${pose}`);
  }
  const file = readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()[0];
  if (!file) throw new Error(`姿势目录是空的：${dir}`);
  const img = cutout(decodePng(readFileSync(join(dir, file)))).img;
  poseCache.set(pose, img);
  return img;
}

/**
 * 帧内色板：把这帧自己的高频颜色抽出来。
 *
 * 试过"所有帧共用一份 28/64 色板"，会出事：白衣的暗部在整份色板里最近的邻居
 * 往往是墨绿裤子的中绿，于是白衣服上会被点出一道道绿色。帧内取色就不会——
 * 那件白衣的暗部就长在这帧自己身上，一定在色板里。
 */
function framePalette(img, maxColors = 32) {
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

/**
 * 头发尺寸：与姿势无关的"绝对尺度"。
 *
 * 包围盒会被甩出去的手脚撑大/缩水，所以不能拿它当缩放基准——
 * 蹲着的人被 AI 画满了画面高度，按包围盒缩放就会比站姿大一圈。
 * 头发是同一头黑发、面积远大于 1px 描边，腐蚀掉描边后取最大的暗色连通块即可稳定量到；
 * 用面积开根（而不是宽/高）是为了抗头部旋转。
 */
function hairSize(img) {
  const y1 = Math.min(img.height, Math.floor(img.height * 0.4)); // 只看上部 40%，深色裤子一定不在
  const w = img.width;
  const h = y1;
  let mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (img.data[i + 3] < 200) continue;
      const luma = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      if (luma < 70) mask[y * w + x] = 1;
    }
  }
  // 腐蚀 3 次，吃掉 1~2px 的描边
  for (let t = 0; t < 3; t++) {
    const next = new Uint8Array(mask.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) next[i] = 1;
      }
    }
    mask = next;
  }
  // 最大连通块
  const seen = new Uint8Array(mask.length);
  let bestArea = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let area = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      area++;
      const x = j % w;
      const y = (j - x) / w;
      if (x > 0 && mask[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && mask[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && mask[j - w] && !seen[j - w]) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && mask[j + w] && !seen[j + w]) { seen[j + w] = 1; stack.push(j + w); }
    }
    if (area > bestArea) bestArea = area;
  }
  return bestArea > 0 ? Math.sqrt(bestArea) : null;
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

// ---------- 变体：从本体图集派生一份染色图集 ----------
/**
 * 暴走八神 / 暴走莉安娜 是同一个人的异色形态，姿势完全一样、只差颜色。
 * 与其重新出 26 个姿势（18 分钟且脸会对不上），不如把本体图集按颜色「乘」一遍：
 * 逐像素 `rgb × tint / 255`，明暗关系保留，色调整体偏移。
 *
 * 为什么放在打包阶段而不是运行时：运行时染色要动合成模式、还要给 Ctx2D 加接口，
 * 而这里纯像素运算，node 里就能验证，导出的图和普通图集完全一样——
 * 加载、LRU、闪白剪影全都不用改。
 */
const FROM = argVal('from');
if (FROM) {
  const tint = (argVal('tint') ?? '255,255,255').split(',').map((v) => Number(v.trim()));
  if (tint.length !== 3 || tint.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) {
    console.error('--tint 要写成 "r,g,b"（0~255）');
    process.exit(1);
  }
  const srcPng = decodePng(readFileSync(`public/sheets/${FROM}.png`));
  const out = { width: srcPng.width, height: srcPng.height, data: new Uint8Array(srcPng.data) };
  // 只染**中间调**：纯黑描边保持黑、白衬衫保持白，中间调（皮肤/裤子/衣褶）整体偏移。
  // 试过整体相乘（白衣服变粉）和只染暗部（黑夹克变红、衣服细节全丢），都不如按亮度取中间。
  const STRENGTH = 0.62;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const lum = (0.299 * out.data[i] + 0.587 * out.data[i + 1] + 0.114 * out.data[i + 2]) / 255;
    const k = STRENGTH * Math.max(0, 1 - Math.abs(lum - 0.45) * 2.1);
    out.data[i] = Math.round(out.data[i] * (1 - k) + tint[0] * k);
    out.data[i + 1] = Math.round(out.data[i + 1] * (1 - k) + tint[1] * k);
    out.data[i + 2] = Math.round(out.data[i + 2] * (1 - k) + tint[2] * k);
  }
  writeFileSync(OUT_IMAGE, encodePng(out));
  const json = JSON.parse(readFileSync(`public/sheets/${FROM}.json`, 'utf8'));
  json.image = `${CHAR_ID}.png`;
  writeFileSync(OUT_JSON, `${JSON.stringify(json, null, 1)}\n`);
  console.log(`${CHAR_ID}：由 ${FROM} 染色派生（tint ${tint.join(',')}）· 图集 ${out.width}×${out.height}`);
  process.exit(0);
}

// ---------- 主流程 ----------
const raws = new Map();
for (const list of Object.values(ANIMS)) {
  for (const pose of list) if (!raws.has(pose)) raws.set(pose, loadPose(pose));
}
// 统一 scale：以 idle 第一帧的身高为"角色身高"
const refPose = ANIMS.idle[0];
const refH = raws.get(refPose).height;
const scale = (CHAR_H * RES) / refH;
/** 以 idle 的头发为 1.0，其它姿势按头发面积开根修正（头部大小一致 = 整张人一致） */
const refHair = hairSize(raws.get(refPose)) ?? 1;

const frames = {};
for (const [anim, list] of Object.entries(ANIMS)) {
  const lying = LYING.has(anim);
  const targetH = HEIGHT_OVERRIDE[anim];
  const cap = HEIGHT_CAP[anim];
  frames[anim] = list.map((pose) => {
    const raw = raws.get(pose);
    // 躺姿的头发被身体挡住/转了 90°，量不准，仍按宽度归一
    const hair = lying ? null : hairSize(raw);
    // 头发比 idle 大说明这张图画得更大，按比例缩回来（不依赖包围盒）
    const k = hair ? refHair / hair : 1;
    const naturalH = Math.round(raw.height * scale * k);
    const sized = lying
      ? scaleToWidth(raw, Math.round(CHAR_H * RES * 1.05))
      : scaleToHeight(raw, targetH !== undefined ? targetH * RES : cap !== undefined ? Math.min(naturalH, cap * RES) : naturalH);
    const img = quantize(sized, framePalette(sized));
    const ox = -Math.round(lying ? img.width / 2 : legAnchorX(img));
    const rect = { w: img.width, h: img.height, ox, oy: -img.height };
    // 剪影：同一形状整片刷白，受击闪白时直接贴这一帧（比盖白方块干净得多）
    let sil = null;
    if (FLASH_ANIMS.has(anim)) {
      sil = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
      for (let i = 0; i < sil.data.length; i += 4) {
        if (sil.data[i + 3] === 0) continue;
        sil.data[i] = 255;
        sil.data[i + 1] = 255;
        sil.data[i + 2] = 255;
        sil.data[i + 3] = 255;
      }
    }
    return { img, sil, rect: { ...rect } };
  });
}

// ---------- 打包：简单货架（宽高都不大，够用） ----------
const MAX_W = 2048;
const order = [];
for (const [anim, list] of Object.entries(frames)) {
  for (const f of list) order.push({ anim, kind: 'normal', img: f.img, rect: { ...f.rect } });
  for (const f of list) if (f.sil) order.push({ anim, kind: 'flash', img: f.sil, rect: { ...f.rect } });
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
  const flash = order.filter((o) => o.anim === anim && o.kind === 'flash').map(pick);
  if (flash.length > 0) flashJson[anim] = flash;
  if (animsJson[anim].length === 0) throw new Error(`动画 ${anim} 一帧都没有`);
  void list;
}
// 别名：直接指到源动画的矩形上（同一块图集区域，JSON 里多几个键而已）
for (const [alias, src] of Object.entries(ALIAS)) {
  if (!animsJson[src]) throw new Error(`别名 ${alias} → ${src} 失败：源动画不存在`);
  animsJson[alias] = animsJson[src].map((f) => ({ ...f }));
  if (flashJson[src]) flashJson[alias] = flashJson[src].map((f) => ({ ...f }));
}

writeFileSync(
  OUT_JSON,
  JSON.stringify(
    // scale：一个源像素等于多少世界单位（绘制时宽高都要乘它，否则贴图会被放大 RES 倍）
    { image: `${CHAR_ID}.png`, width: atlasW, height: atlasH, scale: 1 / RES, anims: animsJson, flash: flashJson },
    null,
    1,
  ),
);

console.log(`${CHAR_ID}：缩放 ${scale.toFixed(4)} · 图集 ${atlasW}×${atlasH}`);
for (const [anim, list] of Object.entries(frames)) {
  console.log(`  ${anim.padEnd(11)} ${list.length} 帧  ${list.map((f) => `${f.rect.w}×${f.rect.h}`).join(' ')}`);
}
