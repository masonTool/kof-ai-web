/**
 * 批量补齐「必杀专属姿势」。
 *
 *   node scripts/sprites/gen-special-all.mjs            # 补所有角色缺的
 *   node scripts/sprites/gen-special-all.mjs --char kyo # 只补一个
 *
 * 为什么要有这个脚本（而不是一行 shell for 循环）：第一次批量是用 shell 跑的，
 * 雅典娜那轮 `gen-cli` 超时（日志里是"等了 300 秒仍未拿到图片，可能生图被风控"），
 * shell 直接跳到下一个角色，最后留下一个只有 29 个动画的图集——
 * **不报错、测试也不红**，玩家只会觉得"这个角色放必杀时姿势怎么和别人的一样"。
 *
 * 所以这里做了三件 shell 版没有的事：
 * 1. 只补**缺的**姿势（已有 png 就跳过，重跑不重复花钱）
 * 2. 每个姿势失败**自动重试**（默认 2 次）——生图超时是概率性的，重试基本能过
 * 3. 打包后**自动重派生变体**（暴走八神 / 暴走莉安娜 是从本体图集染色来的，
 *    本体多了动画而变体没跟上的话，变体会永远停在旧动画表）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHARS } from './chars.mjs';

/** 必杀专属姿势：目录名（小写）与图集动画名（驼峰）的对应 */
const SPECIALS = {
  specialprojectile: 'specialProjectile',
  specialuppercut: 'specialUppercut',
  specialrush: 'specialRush',
  supercharge: 'superCharge',
};

/** 变体角色：从本体图集染色派生，本体更新后必须跟着重派生 */
const VARIANTS = {
  orochi_iori: { from: 'iori', tint: '255,50,40' },
  orochi_leona: { from: 'leona', tint: '150,70,255' },
};

const STYLE = process.env.KYO_STYLE ?? 'ink';
const RETRIES = Number(process.env.RETRIES ?? 2);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function run(script, args) {
  const r = spawnSync('node', [join('scripts/sprites', script), ...args], { stdio: 'inherit' });
  return r.status === 0;
}

/** 某个角色的某个姿势有没有出过图（目录里至少一张 png） */
function hasPose(charId, pose) {
  const dir = join('art-source', `${charId}-raw-${STYLE}`, pose);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith('.png'));
}

const only = arg('char');
const chars = only ? [only] : ['kyo', ...Object.keys(CHARS)];

let missingTotal = 0;
const failedChars = [];

for (const charId of chars) {
  if (!existsSync(join('art-source', `${charId}-base`, STYLE))) {
    // 没有基准图就没法出姿势（gen-poses 要拿它当垫图）
    console.log(`· ${charId}：跳过（没有基准图）`);
    continue;
  }
  const missing = Object.keys(SPECIALS).filter((p) => !hasPose(charId, p));
  if (missing.length === 0) {
    console.log(`· ${charId}：4 个姿势都在，跳过`);
    continue;
  }
  missingTotal += missing.length;
  console.log(`=== ${charId}：缺 ${missing.join(', ')}`);

  let ok = true;
  for (const pose of missing) {
    let done = false;
    for (let attempt = 0; attempt <= RETRIES && !done; attempt++) {
      if (attempt > 0) console.log(`  重试 ${pose}（第 ${attempt} 次）`);
      run('gen-poses.mjs', ['--char', charId, '--only', pose]);
      done = hasPose(charId, pose);
    }
    if (!done) {
      // 单个姿势失败不拖累其它：记下来，最后统一报
      ok = false;
      failedChars.push(`${charId}/${pose}`);
    }
  }
  if (ok) run('build-sheet.mjs', ['--char', charId]);
}

// 变体重派生：本体有专属姿势、变体没有 → 重新染一份
for (const [variant, { from, tint }] of Object.entries(VARIANTS)) {
  if (only && variant !== only) continue;
  if (!existsSync(join('public/sheets', `${from}.json`))) continue;
  console.log(`=== 重派生变体 ${variant}（来自 ${from}）`);
  run('build-sheet.mjs', ['--char', variant, '--from', from, '--tint', tint]);
}

console.log(
  failedChars.length === 0
    ? `\n完成。缺的姿势 ${missingTotal} 个，全部补齐。`
    : `\n有 ${failedChars.length} 个姿势最终失败：${failedChars.join(', ')}\n（生图超时是概率性的，再跑一次本脚本即可，已成功的会被跳过）`,
);
process.exit(failedChars.length === 0 ? 0 : 1);
