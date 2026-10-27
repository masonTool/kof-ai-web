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
  harbor: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：黄昏的海港码头，远处是巨型吊车与集装箱堆场的剪影，海面泛着橙色反光，天空从橙红渐变到深紫，几只海鸟。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的水泥码头地面，近处有几根系缆桩。',
    '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，与格斗游戏人物风格统一。',
    '不要出现任何角色、文字、水印、边框。',
  ].join(''),
  snow: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：雪原深处的古老神社前庭，背景是覆雪的山脊与深蓝夜空，一座朱红鸟居立在雪中，石灯笼散着微光，细雪飘落。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的积雪地面。',
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
  dojo: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：日式木造道场内部，两侧是敞开的障子门与木柱，远处屋檐下挂着一排纸灯笼，庭院里有一棵盛开樱花树，花瓣在空气中飘落，暖黄的光从侧面照进来。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的深色木地板，近处有几级木台阶。',
    '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，与格斗游戏人物风格统一。',
    '不要出现任何角色、文字、水印、边框。',
  ].join(''),
  airport: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：夜晚的机场跑道，远处停着一架客机的机尾剪影，跑道两侧是一排排蓝色指引灯，天空中有一道月牙，塔台在画面一侧，地面是湿漉漉反光的混凝土。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的水泥跑道地面，近处有几道白色跑道标线。',
    '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，与格斗游戏人物风格统一。',
    '不要出现任何角色、文字、水印、边框。',
  ].join(''),
  volcano: [
    '横向全景，2D 格斗游戏舞台背景插画，画面里没有人物、没有文字。',
    '场景：火山口边缘的熔岩地带，远处山体裂开露出橙红色的岩浆流，空气中飘着火星与灰烬，天空是暗红到墨黑的渐变，地面是龟裂的黑色岩石透着红光。',
    '构图：地平线在画面下方三分之一处，画面最下方四分之一是平整的黑色岩石地面，近处有几道发红的裂缝。',
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
