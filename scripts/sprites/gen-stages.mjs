/**
 * 出舞台底图（横向全景，无人物）。
 *
 * 只当"最远层"用：判定线、地面、跳跃高度都还是程序化画的，
 * 所以底图就算构图有偏差也只影响好不好看，不影响玩法。
 *
 * 用法：node scripts/sprites/gen-stages.mjs [--only skyline,valley] [--force]
 * 输出：art-source/stages/<id>/yb-*.png
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MCP_DIR = process.env.YUANBAO_MCP_DIR ?? join(homedir(), 'DouDou', 'yuanbao-mcp');
const PROFILE = process.env.YUANBAO_PROFILE_DIR ?? '/tmp/ybprof';
const OUT = 'art-source/stages';

/** 舞台 id 必须和 `src/render/stage-draw.ts` 的 STAGES 对得上 */
const STAGES = {
  skyline: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：夜晚的都市天台，远处是密集的摩天楼群，楼窗透出暖黄色灯光，深蓝到墨黑的夜空，一轮月亮与薄云。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的深色地面，近处有几根栏杆与灯柱剪影。',
    '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，与格斗游戏人物风格统一。',
    '不要出现任何角色、文字、水印、边框。',
  ].join(''),
  valley: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：黄昏的溪谷，两侧是陡峭的山崖剪影，中间一条干涸的河床，天空是紫红色到橙色的渐变晚霞，远处几只飞鸟。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的暗色地面。',
    '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，与格斗游戏人物风格统一。',
    '不要出现任何角色、文字、水印、边框。',
  ].join(''),
  arena: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：昏暗的地下斗技场，两侧立着粗壮的石柱，后方是层层观众席的剪影，顶上几盏聚光灯打下光柱。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的石板地面。',
    '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，与格斗游戏人物风格统一。',
    '不要出现任何角色、文字、水印、边框。',
  ].join(''),
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = process.argv.includes('--force');
const ids = Object.keys(STAGES).filter((id) => (only ? only.includes(id) : true));

if (!existsSync(PROFILE)) {
  console.error(`浏览器 profile 副本不存在：${PROFILE}（先跑一次 gen-poses 复制登录态）`);
  process.exit(1);
}

for (const id of ids) {
  const dir = join(process.cwd(), OUT, id);
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).some((f) => f.endsWith('.png')) && !force) {
    console.log(`跳过 ${id}（已有底图）`);
    continue;
  }
  console.log(`\n=== ${id} ===`);
  const r = spawnSync(
    'npx',
    ['tsx', 'src/gen-cli.ts', '--count', '2', '--timeout', '300', '--save-dir', dir, '--prompt', STAGES[id]],
    { cwd: MCP_DIR, stdio: 'inherit', env: { ...process.env, YUANBAO_PROFILE_DIR: PROFILE } },
  );
  if (r.status !== 0) console.error(`✗ ${id} 失败`);
}
console.log('\n舞台底图完成');
