/**
 * 素材自检：一条命令核对所有已出素材，有问题就列出清单并以非 0 退出。
 *
 *   node scripts/sprites/check-assets.mjs        # 人读的输出
 *   npm run art:check
 *
 * 查什么（都是真出过问题的那几类）：
 * - 图集：矩形越界、脚底没对齐（oy + h ≠ 0）、动画名缺项（姿势库有、图集没有 = 会闪回程序化）
 * - 图集：idle 身高是不是 84 世界单位（各角色一大一小是之前踩过的坑）
 * - 头像：每个有图集的角色都要有 128×128 头像，变体也不能缺
 * - 舞台：每条舞台数据要么有底图、要么走程序化（有底图就检查尺寸能不能 cover）
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from './png.mjs';

const ROOT = process.cwd();
const SHEETS = join(ROOT, 'public/sheets');
const PORTRAITS = join(ROOT, 'public/portraits');
const STAGES = join(ROOT, 'public/stages');

/** 姿势库里的动画名（从源码里抠，避免脚本和代码两处维护） */
function poseNames() {
  const src = readFileSync(join(ROOT, 'src/render/poses.ts'), 'utf8');
  const start = src.indexOf('export const POSE_LIBRARY');
  const body = src.slice(start);
  const end = body.indexOf('\n};');
  const block = body.slice(0, end);
  return [...block.matchAll(/^  ([a-zA-Z0-9_]+): \{/gm)].map((m) => m[1]);
}

/** 舞台 id（同样从源码抠） */
function stageIds() {
  const src = readFileSync(join(ROOT, 'src/render/stage-draw.ts'), 'utf8');
  return [...src.matchAll(/^    id: '([a-z]+)',$/gm)].map((m) => m[1]);
}

/** 变体角色 → 本体（头像可以借用） */
const VARIANTS = { orochi_iori: 'iori', orochi_leona: 'leona' };

const problems = [];
const warn = (msg) => problems.push(msg);

const poses = poseNames();
const ids = existsSync(SHEETS)
  ? readdirSync(SHEETS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  : [];

if (ids.length === 0) {
  console.error('没有找到任何图集，先跑 npm run art:all');
  process.exit(1);
}

const heights = new Map();

for (const id of ids) {
  const json = JSON.parse(readFileSync(join(SHEETS, `${id}.json`), 'utf8'));
  const pngPath = join(SHEETS, `${id}.png`);
  if (!existsSync(pngPath)) {
    warn(`${id}: 有 json 没有 png`);
    continue;
  }
  const atlas = decodePng(readFileSync(pngPath));
  if (atlas.width !== json.width || atlas.height !== json.height) {
    warn(`${id}: json 声明 ${json.width}×${json.height}，实际 ${atlas.width}×${atlas.height}`);
  }

  // 动画覆盖
  const missing = poses.filter((p) => !(json.anims?.[p]?.length > 0));
  if (missing.length) warn(`${id}: 缺动画 ${missing.join(',')}（这几个动作会闪回程序化绘制）`);

  // 矩形与脚底
  for (const [anim, list] of Object.entries(json.anims ?? {})) {
    for (const f of list) {
      if (f.x < 0 || f.y < 0 || f.x + f.w > atlas.width || f.y + f.h > atlas.height) {
        warn(`${id}/${anim}: 矩形越界`);
      }
      if (f.oy + f.h !== 0) warn(`${id}/${anim}: 脚底没对齐原点（oy + h = ${f.oy + f.h}）`);
    }
  }

  // idle 身高
  const idle = json.anims?.idle?.[0];
  if (idle) {
    const units = (idle.h * json.scale).toFixed(1);
    heights.set(id, Number(units));
    if (Math.abs(units - 84) > 2) warn(`${id}: idle 身高 ${units} 世界单位（基准 84，差太多会同台一大一小）`);
  }

  // 头像
  const portrait = join(PORTRAITS, `${id}.png`);
  if (!existsSync(portrait)) {
    warn(`${id}: 没有头像（public/portraits/${id}.png）`);
  } else {
    const p = decodePng(readFileSync(portrait));
    if (p.width !== 128 || p.height !== 128) warn(`${id}: 头像尺寸 ${p.width}×${p.height}，应为 128×128`);
  }
}

// 变体角色：不要求图集，但必须有头像
for (const variant of Object.keys(VARIANTS)) {
  if (!existsSync(join(PORTRAITS, `${variant}.png`))) warn(`${variant}: 变体没有头像`);
}

// 舞台
for (const id of stageIds()) {
  const art = join(STAGES, `${id}.png`);
  if (!existsSync(art)) {
    console.log(`· 舞台 ${id}: 无底图，走程序化背景（正常）`);
    continue;
  }
  const img = decodePng(readFileSync(art));
  // 底图按 cover 铺满 520×224，宽高比太窄会裁掉很多
  const aspect = img.width / img.height;
  if (aspect < 520 / 224) {
    console.log(`· 舞台 ${id}: ${img.width}×${img.height}，比例 ${aspect.toFixed(2)} 偏窄（理想 2.32），cover 时裁掉的是上下`);
  }
}

// 汇总
const values = [...heights.values()];
const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
console.log(`\n角色图集 ${ids.length} 个 · 动画名 ${poses.length} 个 · idle 身高 ${Math.min(...values)}~${Math.max(...values)}（极差 ${spread.toFixed(1)}）`);

if (problems.length) {
  console.error(`\n✗ 发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('✓ 素材自检通过');
