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
// 图集分两片：`<id>.json` 是核心片、`<id>-extra.json` 是扩展片。
// 校验按「一个角色 = 两片合并」来做，否则扩展片会被当成独立角色报"缺一堆动画"。
const allJsonIds = existsSync(SHEETS)
  ? readdirSync(SHEETS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  : [];
const ids = allJsonIds.filter((id) => !id.endsWith('-extra'));

if (ids.length === 0) {
  console.error('没有找到任何图集，先跑 npm run art:all');
  process.exit(1);
}

const heights = new Map();

for (const id of ids) {
  const mainJson = JSON.parse(readFileSync(join(SHEETS, `${id}.json`), 'utf8'));
  const extraPath = join(SHEETS, `${id}-extra.json`);
  const extraJson = existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf8')) : null;

  // 动画"存在性"用两片合并后的集合判断；**矩形越界必须分开校验**——
  // 两片是两张不同的图，坐标各用各的，混在一起查会把 extra 的矩形按主片尺寸判成越界
  const json = {
    ...mainJson,
    anims: { ...mainJson.anims, ...(extraJson?.anims ?? {}) },
    flash: { ...(mainJson.flash ?? {}), ...(extraJson?.flash ?? {}) },
  };

  const pngPath = join(SHEETS, `${id}.png`);
  if (!existsSync(pngPath)) {
    warn(`${id}: 有 json 没有 png`);
    continue;
  }
  const atlas = decodePng(readFileSync(pngPath));
  if (atlas.width !== mainJson.width || atlas.height !== mainJson.height) {
    warn(`${id}: json 声明 ${mainJson.width}×${mainJson.height}，实际 ${atlas.width}×${atlas.height}`);
  }
  // 扩展片的尺寸单独对
  if (extraJson) {
    const extraPng = join(SHEETS, `${id}-extra.png`);
    if (!existsSync(extraPng)) {
      warn(`${id}: 有 extra.json 没有 extra.png`);
    } else {
      const ea = decodePng(readFileSync(extraPng));
      if (ea.width !== extraJson.width || ea.height !== extraJson.height) {
        warn(`${id}-extra: json 声明 ${extraJson.width}×${extraJson.height}，实际 ${ea.width}×${ea.height}`);
      }
    }
  }

  // 动画覆盖
  const missing = poses.filter((p) => !(json.anims?.[p]?.length > 0));
  if (missing.length) warn(`${id}: 缺动画 ${missing.join(',')}（这几个动作会闪回程序化绘制）`);

  // 矩形与脚底：主片用主片 png 校验，扩展片单独跑一遍（见上）
  const checkRects = (animsObj, w, h, label) => {
    for (const [anim, list] of Object.entries(animsObj ?? {})) {
      for (const f of list) {
        if (f.x < 0 || f.y < 0 || f.x + f.w > w || f.y + f.h > h) {
          warn(`${label}/${anim}: 矩形越界`);
        }
      }
    }
  };
  checkRects(mainJson.anims, atlas.width, atlas.height, id);
  if (extraJson) {
    const extraPng = join(SHEETS, `${id}-extra.png`);
    if (existsSync(extraPng)) {
      const ea = decodePng(readFileSync(extraPng));
      checkRects(extraJson.anims, ea.width, ea.height, `${id}-extra`);
    }
  }

  // 脚底对齐：两片合并后一起查（这个和坐标系无关，只看 oy + h）
  for (const [anim, list] of Object.entries(json.anims ?? {})) {
    for (const f of list) {
      if (f.oy + f.h !== 0) warn(`${id}/${anim}: 脚底没对齐原点（oy + h = ${f.oy + f.h}）`);
    }
  }

  // 站姿身高必须完全一致（同一个人出拳/挨打时不能比待机忽高忽低）
  const STANDING = ['idle', 'walkF', 'walkB', 'guard', 'punchLight', 'punchHeavy', 'kickLight', 'kickHeavy', 'special', 'attack'];
  const standHeights = STANDING.map((a) => json.anims?.[a]?.[0])
    .filter(Boolean)
    .map((f) => Number((f.h * json.scale).toFixed(2)));
  if (standHeights.length > 1) {
    const hMin = Math.min(...standHeights);
    const hMax = Math.max(...standHeights);
    if (hMax - hMin > 0.6) {
      warn(`${id}: 站姿动画身高不一致（${hMin}~${hMax} 世界单位），同一个角色会忽高忽低`);
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

/** 平均色（只算不透明像素），用来核对"染色有没有真的生效" */
function meanColor(file) {
  const img = decodePng(readFileSync(file));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    r += img.data[i];
    g += img.data[i + 1];
    b += img.data[i + 2];
    n += 1;
  }
  return n === 0 ? null : { r: r / n, g: g / n, b: b / n, n };
}

// 变体角色：必须有派生图集，且色调要和本体明显不同（否则选中了也看不出区别）
for (const [variant, base] of Object.entries(VARIANTS)) {
  if (!existsSync(join(PORTRAITS, `${variant}.png`))) warn(`${variant}: 变体没有头像`);
  const vSheet = join(SHEETS, `${variant}.png`);
  const bSheet = join(SHEETS, `${base}.png`);
  if (!existsSync(vSheet)) {
    warn(`${variant}: 没有派生图集（跑 build-sheet --char ${variant} --from ${base} --tint r,g,b）`);
    continue;
  }
  if (!existsSync(bSheet)) continue;
  const mv = meanColor(vSheet);
  const mb = meanColor(bSheet);
  if (!mv || !mb) continue;
  const dist = Math.hypot(mv.r - mb.r, mv.g - mb.g, mv.b - mb.b);
  if (dist < 18) warn(`${variant}: 和本体 ${base} 的平均色只差 ${dist.toFixed(1)}，染色没生效？`);
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
