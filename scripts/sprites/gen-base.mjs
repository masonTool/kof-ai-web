/**
 * 出「基准图」候选：同一个角色、同一个姿势、几种不同画风，让用户挑一张当锚点。
 *
 * 为什么不直接开烤箱：后面几十个动作帧全都要拿它当垫图（reference），
 * 选错一次就得整批返工，所以先把第一张定下来。
 *
 * 用法：node scripts/sprites/gen-base.mjs [--only cel,anime] [--force]
 * 输出：art-source/kyo-base/<风格>/yb-*.png
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CHARS, STYLE_LINE } from './chars.mjs';

const MCP_DIR = process.env.YUANBAO_MCP_DIR ?? join(homedir(), 'DouDou', 'yuanbao-mcp');
const PROFILE = process.env.YUANBAO_PROFILE_DIR ?? '/tmp/ybprof';
/** 角色：决定描述文本与输出目录 */
const CHAR = arg('char') ?? 'kyo';
const INFO = CHARS[CHAR];
if (!INFO) {
  console.error(`未知角色 ${CHAR}（看 scripts/sprites/chars.mjs）`);
  process.exit(1);
}
/** 京有早期像素图可以当垫图；其它角色没有，纯文本起手 */
const REF_IMAGE = CHAR === 'kyo' ? 'art-source/kyo-raw-v2/idle' : null;
const OUT = `art-source/${CHAR}-base`;

/** 角色与构图锁死，只有画风这一句在变 */
const SUBJECT = [
  `单人全身立绘，2D 格斗游戏角色。角色：${INFO.look}。`,
  '姿势：格斗站架，身体侧向右，前手抬到脸侧、后手护在胸前，双脚前后分开、膝盖微屈。',
  '构图：严格侧身朝右，全身入镜，脚踩画面底边，人物占画面高度 85%，水平居中。',
  '背景：纯洋红色（#FF00FF）平涂，无地面、无阴影、无文字、无水印、无边框。',
].join('');

/** 画风候选：键名 = 目录名（当前只做 ink，其它留着以后换皮） */
const STYLES = {
  // 1. 像素风的"高密度"版：还是像素，但格子更小、明暗层次更多
  pixel: '画风：精细像素画（高密度像素），每个像素方块很小，1 像素黑色描边，明暗三到四档，颜色干净，无渐变过渡、无抗锯齿。',
  // 2. 赛璐璐动画（KOF XIII 那种高清 2D）
  cel: '画风：赛璐璐动画风，粗黑墨线描边，两到三段硬边阴影，边缘干净无模糊，头发和衣服有明确高光块，日式格斗游戏立绘质感。',
  // 3. 精致日式动画立绘（细描边 + 柔和阴影）
  anime: '画风：精致日式动画立绘，细黑线描边，柔和但明确的阴影，布料有褶皱体积，皮肤有轻微渐变，接近现代格斗游戏的选人画面。',
  // 4. 半写实厚涂（体积感最强）
  semi: '画风：半写实厚涂，笔触明显，明暗对比强，布料褶皱与肌肉体积清晰，皮肤有真实感的明暗过渡，接近写实向格斗游戏概念图。',
  // 5. 高对比墨线（接近 KOF 系列的手绘宣传图）
  ink: STYLE_LINE,
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = process.argv.includes('--force');
// 默认只出 ink（用户已经选定的画风）；要试别的风格再显式 --only
const targets = only ?? ['ink'];

if (!existsSync(PROFILE)) {
  console.error(`浏览器 profile 副本不存在：${PROFILE}\n先跑一次 scripts/sprites/gen-poses.mjs（它会自动复制登录态）`);
  process.exit(1);
}
/** 有垫图就用（让京保持原设计），没有就纯文本起手 */
let refFile = null;
if (REF_IMAGE) {
  const refDir = join(process.cwd(), REF_IMAGE);
  refFile = join(refDir, readdirSync(refDir).filter((f) => f.endsWith('.png')).sort()[0] ?? '');
  if (!existsSync(refFile)) {
    console.error(`参考图不存在：${refFile}`);
    process.exit(1);
  }
}

const failed = [];
for (const style of targets) {
  const dir = join(OUT, style);
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).some((f) => f.endsWith('.png')) && !force) {
    console.log(`跳过 ${style}（已有候选）`);
    continue;
  }
  console.log(`\n=== ${style} ===`);
  const r = spawnSync(
    'npx',
    [
      'tsx',
      'src/gen-cli.ts',
      '--count', '2',
      '--timeout', '300',
      '--save-dir', join(process.cwd(), dir),
      ...(refFile ? ['--ref', refFile] : []),
      '--prompt', `${SUBJECT}${STYLES[style]}`,
    ],
    { cwd: MCP_DIR, stdio: 'inherit', env: { ...process.env, YUANBAO_PROFILE_DIR: PROFILE } },
  );
  if (r.status !== 0) {
    console.error(`✗ ${style} 失败`);
    failed.push(style);
  }
}

console.log(`\n完成。失败：${failed.length ? failed.join(', ') : '无'}`);
