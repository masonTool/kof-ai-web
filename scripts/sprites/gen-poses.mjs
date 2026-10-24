/**
 * 用元宝「带参考图」的方式，把京的每个姿势都重出一遍。
 *
 * 为什么必须带参考图：不带的时候，每个姿势是"另一次独立想象"，出来的人长得都不一样
 * （发型、脸型、衣服开合、裤子长度全都会漂）。带同一张 idle 当锚点，服装和脸才稳得住。
 *
 * 依赖：本机的 yuanbao-mcp（默认 ~/DouDou/yuanbao-mcp），走它的 CLI（等价于 MCP 工具）：
 *   node scripts/sprites/gen-poses.mjs [--only punch,kick] [--force]
 *
 * 输出：art-source/kyo-raw-v2/<姿势>/yb-*.png
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MCP_DIR = process.env.YUANBAO_MCP_DIR ?? join(homedir(), 'DouDou', 'yuanbao-mcp');
/** 画风：决定"用哪张基准图当垫图" + "提示词里怎么写画风"。基准图由 gen-base.mjs 出。 */
const STYLE = process.env.KYO_STYLE ?? 'ink';
/**
 * 浏览器 profile：MCP 服务进程活着的时候会独占用 ~/.yuanbao-mcp/profile，
 * 再开一个浏览器会撞 ProcessSingleton。所以这里一律用副本（登录 cookie 都在里面）。
 */
const REAL_PROFILE = join(homedir(), '.yuanbao-mcp', 'profile');
const PROFILE_COPY = process.env.YUANBAO_PROFILE_DIR ?? '/tmp/ybprof';

function ensureProfileCopy() {
  if (existsSync(PROFILE_COPY)) return;
  console.log(`复制登录态：${REAL_PROFILE} → ${PROFILE_COPY}`);
  const r = spawnSync(
    'rsync',
    ['-a', '--exclude', 'Singleton*', '--exclude', 'lockfile', `${REAL_PROFILE}/`, `${PROFILE_COPY}/`],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error('复制 profile 失败（元宝还没登录？先跑 npm run login）');
}

ensureProfileCopy();
/**
 * 锚点参考图：所有姿势都照着这一张长。
 *
 * 用基准图（不是旧的像素版）当垫图，风格才会跟着走——
 * 换画风只要换 `KYO_STYLE`，姿势表不用动。
 */
const REF_DIR = `art-source/kyo-base/${STYLE}`;
const OUT = `art-source/kyo-raw-${STYLE}`;

/** 角色描述锁死（每个姿势都原样带一遍，模型才不会自由发挥） */
const CHAR = [
  '参照这张图的角色形象，画同一个角色的另一个动作。角色固定不变：',
  '年轻日本男高中生格斗家，黑色刺猬头碎发，黄种人肤色，',
  '白色高立领学生服上衣（敞开、袖子挽到手肘），深墨绿近黑的长裤，白色运动鞋，黑色腰带；',
  '脸型、发型、五官、服装款式与配色必须和参照图完全一致。',
].join('');

/** 画风描述：与 gen-base.mjs 里同名的那一条保持一字不差，否则姿势会和基准图不是一个画风 */
const STYLE_LINES = {
  pixel: '画风：精细像素画（高密度像素），每个像素方块很小，1 像素黑色描边，明暗三到四档，颜色干净，无渐变过渡、无抗锯齿。',
  cel: '画风：赛璐璐动画风，粗黑墨线描边，两到三段硬边阴影，边缘干净无模糊，头发和衣服有明确高光块，日式格斗游戏立绘质感。',
  anime: '画风：精致日式动画立绘，细黑线描边，柔和但明确的阴影，布料有褶皱体积，皮肤有轻微渐变，接近现代格斗游戏的选人画面。',
  semi: '画风：半写实厚涂，笔触明显，明暗对比强，布料褶皱与肌肉体积清晰，皮肤有真实感的明暗过渡，接近写实向格斗游戏概念图。',
  ink: '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，头发用成块黑色，整体像格斗游戏宣传插画。',
};

/**
 * 构图与画法约束同样锁死。
 *
 * `height` 是"人物占画面高度的百分比"：AI 默认一律画满 85%，
 * 于是蹲姿会被它画得和站姿一样高——**整个人大一圈**。蹲姿必须自己降下来。
 */
function frame(height = 85) {
  return [
    `严格侧身朝右，全身像，脚踩在画面底边，人物占画面高度 ${height}%，水平居中。`,
    '纯洋红色背景（#FF00FF）平涂，无地面、无阴影、无文字、无水印、无边框。',
  ].join('');
}

/** 姿势 → 动作描述（键名对应 build-kyo.mjs 里的目录名） */
const POSES = {
  idle: '格斗站架：双脚前后分开、膝盖微屈、前手护在脸侧、后手护在胸前',
  walk1: '走路迈步：前脚向前踏出踩地、后脚在后方蹬地，手臂自然前后摆动，身体略微前倾',
  walk2: '走路中途：双脚在身体下方交汇过渡、重心移到前脚，手臂摆动到中间位置',
  guard: '防御格挡：双臂抬起、小臂交叉护在脸前和胸前、拳头收紧、身体微微后倾、双脚前后分开站稳',
  crouch: '蹲下：双膝深深弯曲下蹲、上身压低前倾、双手护在身前、重心居中',
  jumpup: '跳跃上升：双脚离地、双膝收起、手臂向上抬起、身体略微后仰',
  jumpdown: '跳跃下落：双脚离地、双腿向下伸展、手臂张开保持平衡、身体前倾',
  punchwindup: '出拳蓄力：右拳收在腰侧、肘部向后拉、身体侧转、重心压在後脚',
  punchout: '右拳向前打出：手臂完全伸直、拳头朝前、身体侧向出拳方向',
  kickwindup: '踢腿蓄力：右膝抬起收在身前、重心移到支撑腿、双手护住上身',
  kickout: '横踢：右腿向正前方水平踢出、脚背绷直、支撑腿微弯、双手张开保持平衡',
  hit: '被重拳打中：头猛地向后仰、上身向后折、双臂被震得向后下方甩开、嘴巴张开、胸口后缩、双脚前后分开被推得后滑',
  down: '躺在地上：仰面横躺在画面底部，头朝左、四肢摊开、衣服有褶皱',
  win: '胜利：站直、一只手高举握拳、头微微抬起、另一只手垂在身侧',
  crouchpunch: { text: '蹲着出拳：双膝深蹲、上身前压，一只手向正前方打出直拳、另一只手护在胸前', height: 65 },
  crouchkick: { text: '蹲着扫腿：蹲低、一只手撑地，一条腿贴着地面向正前方扫出', height: 58 },
  jumpattack: '空中攻击：人在空中、双脚离开地面，一只手向下挥出拳、身体前倾',
  special: '必杀技起手：前冲一步，一只手向前打出直拳、身体向前压、另一只手向后拉开',
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = process.argv.includes('--force');
const targets = Object.keys(POSES).filter((k) => (only ? only.includes(k) : true));

if (!existsSync(MCP_DIR)) {
  console.error(`找不到 yuanbao-mcp：${MCP_DIR}（用 YUANBAO_MCP_DIR 指定）`);
  process.exit(1);
}

const refDir = join(process.cwd(), REF_DIR);
if (!existsSync(refDir)) {
  console.error(`找不到基准图目录：${refDir}（先跑 node scripts/sprites/gen-base.mjs）`);
  process.exit(1);
}
const refFile = join(refDir, readdirSync(refDir).filter((f) => f.endsWith('.png')).sort()[0] ?? '');
if (!existsSync(refFile)) {
  console.error(`基准图目录是空的：${refDir}`);
  process.exit(1);
}
console.log(`画风 ${STYLE} · 垫图 ${refFile}`);

let failed = [];
for (const pose of targets) {
  const dir = join(OUT, pose);
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((f) => f.endsWith('.png'));
  if (existing.length > 0 && !force) {
    console.log(`跳过 ${pose}（已有 ${existing.length} 张）`);
    continue;
  }

  const spec = POSES[pose];
  const text = typeof spec === 'string' ? spec : spec.text;
  const height = typeof spec === 'string' ? 85 : (spec.height ?? 85);
  const prompt = `${CHAR}动作：${text}。${frame(height)}${STYLE_LINES[STYLE] ?? STYLE_LINES.ink}`;
  console.log(`\n=== ${pose} ===`);
  const r = spawnSync(
    'npx',
    [
      'tsx',
      'src/gen-cli.ts',
      '--count', '2',
      '--timeout', '300',
      '--save-dir', join(process.cwd(), dir),
      '--ref', refFile,
      '--prompt', prompt,
    ],
    { cwd: MCP_DIR, stdio: 'inherit', env: { ...process.env, YUANBAO_PROFILE_DIR: PROFILE_COPY } },
  );
  if (r.status !== 0) {
    console.error(`✗ ${pose} 失败（exit ${r.status}）`);
    failed.push(pose);
  }
}

console.log(`\n完成。失败：${failed.length ? failed.join(', ') : '无'}`);
