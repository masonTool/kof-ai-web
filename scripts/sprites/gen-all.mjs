/**
 * 批量出图驱动：按 `chars.mjs` 的优先级，一个角色一个角色走完
 * 「基准图 → 13 个姿势 → 打包图集」。
 *
 *   node scripts/sprites/gen-all.mjs [--only iori,terry] [--from iori] [--skip-build]
 *
 * 特性：
 * - **可随时中断、可重入**：已经出过的角色/姿势一律跳过（`--force` 才重出）
 * - 单角色失败不影响后面（记录到 FAILED，最后汇总）
 * - 每个角色做完立刻打包，游戏里马上能看到
 *
 * 时间预算：单角色约 9~10 分钟（14 次生成 × 40s 左右）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHARS, ORDER } from './chars.mjs';

const ROOT = process.cwd();
const STYLE = 'ink';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const from = arg('from');
const skipBuild = process.argv.includes('--skip-build');

let ids = [...ORDER];
if (only) ids = ids.filter((id) => only.includes(id));
else if (from) {
  const start = ids.indexOf(from);
  if (start < 0) {
    console.error(`--from ${from} 不在队列里`);
    process.exit(1);
  }
  ids = ids.slice(start);
}

function baseDone(id) {
  const dir = join(ROOT, `art-source/${id}-base/${STYLE}`);
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.png'));
}

function sheetDone(id) {
  return existsSync(join(ROOT, `public/sheets/${id}.json`));
}

function run(script, args) {
  const started = Date.now();
  const r = spawnSync('node', [join('scripts/sprites', script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const sec = ((Date.now() - started) / 1000).toFixed(0);
  return { ok: r.status === 0, sec };
}

const failed = [];
const t0 = Date.now();

for (const [i, id] of ids.entries()) {
  const name = CHARS[id]?.name ?? id;
  console.log(`\n════ [${i + 1}/${ids.length}] ${name}（${id}）════`);

  if (sheetDone(id) && !process.argv.includes('--force')) {
    console.log(`  已有图集，跳过（要重出加 --force）`);
    continue;
  }

  if (!baseDone(id) || process.argv.includes('--force')) {
    console.log('  → 基准图');
    const r = run('gen-base.mjs', ['--char', id]);
    if (!r.ok) {
      console.error(`  ✗ ${id} 基准图失败`);
      failed.push(id);
      continue;
    }
    console.log(`  ✓ 基准图 ${r.sec}s`);
  }

  console.log('  → 13 个姿势');
  const p = run('gen-poses.mjs', ['--char', id]);
  if (!p.ok) {
    console.error(`  ✗ ${id} 姿势失败`);
    failed.push(id);
    continue;
  }
  console.log(`  ✓ 姿势 ${p.sec}s`);

  if (!skipBuild) {
    console.log('  → 打包图集');
    const b = run('build-sheet.mjs', ['--char', id]);
    if (!b.ok) {
      console.error(`  ✗ ${id} 打包失败`);
      failed.push(id);
      continue;
    }
    console.log(`  ✓ 图集 ${b.sec}s`);
  }
  console.log(`  总计 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
}

console.log(`\n===== 队列结束：${ids.length - failed.length}/${ids.length} 完成 =====`);
if (failed.length) console.log(`失败：${failed.join(', ')}（重跑会自动跳过已完成的）`);
