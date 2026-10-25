#!/usr/bin/env node
// dev 启动器：端口被旧进程占着就先回收，再拉起 vite。
//
// 为什么不直接去掉 strictPort 让 vite 自动 +1：
//   scripts/selftest-*.mjs 全部硬编码 http://localhost:5171，
//   端口漂移会让自测打到空端口/别的服务上。
// 所以这里保持端口固定，改成"启动前把占位者清掉"。
//
// 用法：npm run dev            # 只回收 node/vite 类的占用进程
//      DEV_KILL_ANY=1 npm run dev   # 任何进程都回收（别的服务占着时用）

import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const DEFAULT_PORT = 5171;
const FORCE = process.env.DEV_KILL_ANY === '1';

function log(msg) {
  process.stdout.write(`[dev] ${msg}\n`);
}

function viteBin() {
  try {
    const pkg = require.resolve('vite/package.json');
    return path.join(path.dirname(pkg), 'bin', 'vite.js');
  } catch {
    return path.resolve('node_modules/vite/bin/vite.js');
  }
}

// 端口以 vite.config.ts 为准，免得脚本和配置脱钩
async function resolvePort() {
  try {
    const { resolveConfig } = await import('vite');
    const config = await resolveConfig({}, 'serve');
    return config.server?.port ?? DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function isPortBusy(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (busy) => {
      sock.destroy();
      resolve(busy);
    };
    sock.setTimeout(600);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

function listeningPids(port) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
      const pids = out
        .split(/\r?\n/)
        .filter((line) => /LISTENING/i.test(line) && new RegExp(`[:.]${port}\\b`).test(line))
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && pid !== '0');
      return [...new Set(pids)];
    }
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN', '-n', '-P'], {
      encoding: 'utf8',
    });
    return [...new Set(out.split(/\s+/).filter(Boolean))];
  } catch {
    return [];
  }
}

function describePid(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
      });
      return out.split('","')[0].replace(/^"/, '').trim() || `pid ${pid}`;
    }
    const out = execFileSync('ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' });
    return out.trim().slice(0, 100) || `pid ${pid}`;
  } catch {
    return `pid ${pid}`;
  }
}

function killPid(pid, signal) {
  try {
    process.kill(Number(pid), signal);
    return true;
  } catch {
    return false;
  }
}

async function freePort(port) {
  if (!(await isPortBusy(port))) return true;

  const pids = listeningPids(port);
  if (pids.length === 0) {
    log(`端口 ${port} 被占用，但查不到占用进程（可能需要更高权限）`);
    log(`手动处理：lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill -9`);
    return false;
  }

  const targets = [];
  for (const pid of pids) {
    const desc = describePid(pid);
    const looksLikeDevServer = /vite|node|bun|deno/i.test(desc);
    if (!FORCE && !looksLikeDevServer) {
      log(`跳过 pid ${pid}（${desc}）—— 看着不像 dev server，不擅自杀`);
      log(`确认要腾端口就重跑：DEV_KILL_ANY=1 npm run dev`);
      return false;
    }
    log(`回收 pid ${pid}（${desc}）`);
    targets.push(pid);
  }

  for (const pid of targets) killPid(pid, 'SIGTERM');
  for (let i = 0; i < 20; i += 1) {
    if (!(await isPortBusy(port))) return true;
    await sleep(100);
  }

  for (const pid of targets) killPid(pid, 'SIGKILL');
  for (let i = 0; i < 20; i += 1) {
    if (!(await isPortBusy(port))) return true;
    await sleep(100);
  }

  log(`端口 ${port} 仍然占用，放弃启动`);
  return false;
}

async function main() {
  const port = await resolvePort();
  if (!(await freePort(port))) process.exit(1);

  const child = spawn(process.execPath, [viteBin(), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  const forward = (signal) => () => {
    if (!child.killed) child.kill(signal);
  };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

await main();
