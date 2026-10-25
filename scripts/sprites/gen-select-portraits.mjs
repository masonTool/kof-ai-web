/**
 * 出「选人界面大特写」用的角色半身像。
 *
 * 为什么需要单独出图：原来选人头像是从**图集 idle 帧裁头部**（128×128），
 * 放大到格子尺寸后就糊了，而且只有"站着"一个姿势，看不出角色气质。
 * 选人屏是玩家第一次认真看角色的地方，值得单独一张 3/4 侧身半身图。
 *
 * 用法：node scripts/sprites/gen-select-portraits.mjs [--only kyo,iori] [--force]
 * 输出：art-source/selportraits/<id>/yb-*.png（纯洋红底，抠图管线复用 cutout.mjs）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CHARS } from './chars.mjs';

const MCP_DIR = process.env.YUANBAO_MCP_DIR ?? join(homedir(), 'DouDou', 'yuanbao-mcp');
const PROFILE = process.env.YUANBAO_PROFILE_DIR ?? '/tmp/ybprof';
const OUT = 'art-source/selportraits';
const STYLE = process.env.KYO_STYLE ?? 'ink';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * 每个角色的"姿势气质"：同一套构图，动作不同，能看出是谁。
 *
 * 注意只列**有基准图**的角色：暴走八神/莉安娜是由本体染色派生的，
 * 它们没有自己的 `-base` 目录，出图会直接失败；选人时用本体的特写染色即可。
 */
const POSES = {
  kyo: '单手插兜、另一只手食指指向镜头，微侧头，嘴角带笑',
  iori: '一手撩开额前长发、微微低头，另一只手垂在身侧',
  benimaru: '一手拨弄头发、姿态放松，另一手随意搭在腰上',
  daimon: '双手抱胸、站稳如山，微微抬眼',
  terry: '一手压住棒球帽帽檐、另一手握拳抬起',
  andy: '身形前倾、双手抬在胸前摆出架式',
  joe: '双拳高举过肩、咧嘴大笑',
  ryo: '正身站定、双拳收在腰侧，表情沉稳',
  robert: '一手整理西装领口、侧身回望',
  yuri: '单脚轻跳起、双拳举起，笑容灿烂',
  leona: '侧身站立、长发挡脸，一手垂握成爪',
  ralf: '一手敬礼式抬到额前、咧嘴一笑',
  clark: '扶了扶墨镜、另一手握拳',
  athena: '双手在胸前比出爱心、眨眼',
  kensou: '一手挠头、另一手叉腰，表情憨厚',
  chin: '一手提着酒葫芦、另一手背后',
  kim: '双手抱拳行礼、腰背笔直',
  chang: '肩上扛着大铁球、憨憨地笑',
  choi: '踩在小铁球上、一手叉腰一手指前',
  billy: '肩扛长棍、一手扶棍身',
  eiji: '一手按在刀柄上、侧身半隐在阴影里',
  shingo: '一只手举着笔记本、另一只手比出拳',
  yashiro: '单手握拳抬起、微微仰头',
  shermie: '一手抚过紫发、身体侧倾',
  chris: '双手插兜、孩子气地歪头',
  goenitz: '双手合抱于胸前、闭目，衣摆被风吹起',
  orochi: '双臂张开、微微仰头，气度睥睨',
};

const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = process.argv.includes('--force');
const ids = Object.keys(POSES).filter((id) => (only ? only.includes(id) : true));

if (!existsSync(PROFILE)) {
  console.error(`浏览器 profile 副本不存在：${PROFILE}（先跑一次 gen-poses 复制登录态）`);
  process.exit(1);
}

const failed = [];
for (const id of ids) {
  const dir = join(process.cwd(), OUT, id);
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).some((f) => f.endsWith('.png')) && !force) {
    console.log(`跳过 ${id}（已有半身像）`);
    continue;
  }
  // 参考图：用该角色的基准图，保证脸/发型/服装和游戏内一致
  const baseDir = join('art-source', `${id}-base`, STYLE);
  const ref = existsSync(baseDir) ? readdirSync(baseDir).find((f) => f.endsWith('.png')) : undefined;
  if (!ref) {
    console.error(`✗ ${id} 没有基准图（先跑 gen-base）`);
    failed.push(id);
    continue;
  }
  const look = CHARS[id]?.look ?? '';
  const prompt = [
    `参照这张图的角色形象，画同一个角色的**半身特写**。角色固定不变：${look}；`,
    '脸型、发型、五官、服装款式与配色必须和参照图完全一致。',
    `姿态：${POSES[id]}。`,
    '构图：从髋部以上取景的半身像，人物占画面高度 80%，水平居中，3/4 侧身朝右。',
    '纯洋红色背景（#FF00FF）平涂，无地面、无阴影、无文字、无水印、无边框。',
    '画风：漫画墨线风，粗黑勾线、高对比平涂、少量网点阴影，头发用成块黑色，',
    '整体像格斗游戏选人界面的角色特写插画。',
  ].join('');
  console.log(`\n=== ${id} ===`);
  let ok = false;
  for (let attempt = 0; attempt <= 1 && !ok; attempt++) {
    if (attempt > 0) console.log(`  重试 ${id}`);
    const r = spawnSync(
      'npx',
      [
        'tsx',
        'src/gen-cli.ts',
        '--count',
        '1',
        '--timeout',
        '300',
        '--save-dir',
        dir,
        '--ref',
        join(process.cwd(), baseDir, ref),
        '--prompt',
        prompt,
      ],
      { cwd: MCP_DIR, stdio: 'inherit', env: { ...process.env, YUANBAO_PROFILE_DIR: PROFILE } },
    );
    ok = r.status === 0 && readdirSync(dir).some((f) => f.endsWith('.png'));
  }
  if (!ok) failed.push(id);
}

console.log(
  failed.length === 0 ? '\n半身像出图完成（无失败）' : `\n有 ${failed.length} 个失败：${failed.join(', ')}（重跑本脚本会跳过已成功的）`,
);
process.exit(failed.length === 0 ? 0 : 1);
