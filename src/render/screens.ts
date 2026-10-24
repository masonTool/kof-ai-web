/**
 * 各屏绘制：标题 / 选人 / VS / 结果。
 * 只吃 `Ctx2D`，所以能像 HUD 一样在 node 里用假 ctx 断言"画了什么"。
 */
import type { CharDef } from '../data/schema';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import { gridColumns, type AppFlow } from '../ui/flow';
import type { Ctx2D } from './ctx';
import { drawFighter } from './fighter-draw';

export const SCREEN_COLORS = {
  bg: '#0a0e1a',
  panel: '#111a2c',
  edge: '#2c3a55',
  text: '#f2f0e6',
  dim: '#8fa0be',
  accent: '#ff5b3d',
  gold: '#ffd166',
} as const;

function text(
  ctx: Ctx2D,
  str: string,
  x: number,
  y: number,
  align: 'left' | 'center' | 'right',
  size: number,
  color: string,
): void {
  ctx.font = `${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

/** 角色格子：名字 + 色块（用角色主色，选人时一眼能分辨） */
/**
 * 选人格子：3 行（12 人）以内都放得下。
 * 行高按人数自动收一点——36 人时会变成 9 列 4 行，格子更小。
 */
export function cellRect(index: number, count: number, columns = gridColumns(count)): { x: number; y: number; w: number; h: number } {
  const rows = Math.max(1, Math.ceil(count / columns));
  const gapX = columns > 5 ? 6 : 10;
  const gapY = 6;
  const top = 50;
  const bottom = 198;
  // 列数一多（16 人起是 6 列），格子必须变窄，否则整排会横出屏幕
  const w = Math.min(56, Math.floor((VIEW_WIDTH - 12 - (columns - 1) * gapX) / columns));
  // 行数多了就把格子压扁，保证 320×224 里一定放得下
  const h = Math.max(18, Math.min(44, Math.floor((bottom - top - (rows - 1) * gapY) / rows)));
  const col = index % columns;
  const row = Math.floor(index / columns);
  const totalW = columns * w + (columns - 1) * gapX;
  const left = (VIEW_WIDTH - totalW) / 2;
  return { x: left + col * (w + gapX), y: top + row * (h + gapY), w, h };
}

export function drawTitle(ctx: Ctx2D, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  // 背景横条，别太素
  ctx.fillStyle = SCREEN_COLORS.panel;
  for (let y = 0; y < VIEW_HEIGHT; y += 16) ctx.fillRect(0, y, VIEW_WIDTH, 6);

  text(ctx, "KOF '97", VIEW_WIDTH / 2, 58, 'center', 30, SCREEN_COLORS.accent);
  text(ctx, 'WEB REMAKE', VIEW_WIDTH / 2, 94, 'center', 9, SCREEN_COLORS.gold);

  if (blinkOn) {
    text(ctx, '按 A 开始 · 点屏幕也可', VIEW_WIDTH / 2, 132, 'center', 9, SCREEN_COLORS.text);
  }
  text(ctx, 'A 轻拳 B 轻脚 C 重拳 D 重脚 · A+B 回避 · C+D 吹飞 · ABC MAX', VIEW_WIDTH / 2, 190, 'center', 6, SCREEN_COLORS.dim);
  text(ctx, '方向键移动/跳蹲 · 236/623/214 出必杀', VIEW_WIDTH / 2, 200, 'center', 6, SCREEN_COLORS.dim);
}

export function drawSelect(ctx: Ctx2D, flow: AppFlow, blinkOn: boolean): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, 'SELECT YOUR FIGHTER', VIEW_WIDTH / 2, 22, 'center', 12, SCREEN_COLORS.gold);

  const count = flow.roster.length;
  flow.roster.forEach((char: CharDef, i: number) => {
    const r = cellRect(i, count, flow.columns);
    const p1Here = flow.cursor[0] === i;
    const p2Here = flow.cursor[1] === i;
    // 名字要保证放得进格子：中文/假名在等宽字体里约等于 1 个字宽 = 字号，
    // 所以按 (格宽 / 字数) 反推字号；小于 4px 就截断加省略号，宁可短也别糊成一团。
    const fitName = (name: string, maxW: number): { label: string; size: number } => {
      const size = Math.min(8, Math.floor((maxW - 2) / Math.max(1, name.length)));
      if (size >= 4) return { label: name, size };
      const maxChars = Math.max(2, Math.floor((maxW - 2) / 4) - 1);
      return { label: `${name.slice(0, maxChars)}…`, size: 5 };
    };

    ctx.fillStyle = char.palette.primary;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = char.palette.secondary;
    ctx.fillRect(r.x, r.y + r.h - 12, r.w, 12);

    // 边框：P1 红、P2 蓝
    if (p1Here) {
      ctx.strokeStyle = SCREEN_COLORS.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
    if (p2Here) {
      ctx.strokeStyle = '#5aa9ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    }

    // 格子里放一个缩小版的待机姿势；格子太扁（人多时）就不画，
    // 否则小人会顶在名字上，反而更难认。
    if (r.h < 30) {
      const fittedFlat = fitName(char.name, r.w);
      text(ctx, fittedFlat.label, r.x + r.w / 2, r.y + r.h / 2 - fittedFlat.size / 2, 'center', fittedFlat.size, SCREEN_COLORS.text);
      if (p1Here) text(ctx, 'P1', r.x + 2, r.y + 2, 'left', 5, '#ffd9cf');
      if (p2Here) text(ctx, 'CPU', r.x + r.w - 2, r.y + 2, 'right', 5, '#cfe4ff');
      return;
    }
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h - 9);
    const figScale = Math.max(0.22, Math.min(0.42, Math.min(r.h / 105, r.w / 140)));
    ctx.scale(figScale, figScale);
    drawFighter(ctx, {
      palette: char.palette,
      facing: 1,
      x: 0,
      y: 0,
      anim: 'idle',
      elapsed: 0,
    });
    ctx.restore();

    const fitted = fitName(char.name, r.w);
    text(ctx, fitted.label, r.x + r.w / 2, r.y + 4, 'center', fitted.size, SCREEN_COLORS.text);
    if (p1Here) text(ctx, 'P1', r.x + 2, r.y + r.h - 11, 'left', 6, '#ffd9cf');
    if (p2Here) text(ctx, 'CPU', r.x + r.w - 2, r.y + r.h - 11, 'right', 6, '#cfe4ff');
  });

  const label = flow.locked[0] ? '已确定 · B/D 重选' : 'A/C 确定 · 方向键选人';
  if (blinkOn || flow.locked[0]) text(ctx, label, VIEW_WIDTH / 2, 200, 'center', 7, SCREEN_COLORS.text);
  text(ctx, '点击角色格子也能选', VIEW_WIDTH / 2, 212, 'center', 6, SCREEN_COLORS.dim);
}

export function drawVs(ctx: Ctx2D, flow: AppFlow): void {
  ctx.fillStyle = SCREEN_COLORS.bg;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  const [a, b] = flow.picks ?? [flow.roster[0]!, flow.roster[flow.roster.length - 1]!];

  ctx.fillStyle = a.palette.primary;
  ctx.fillRect(24, 56, 100, 110);
  ctx.fillStyle = b.palette.primary;
  ctx.fillRect(VIEW_WIDTH - 124, 56, 100, 110);

  text(ctx, a.name, 74, 172, 'center', 10, SCREEN_COLORS.text);
  text(ctx, b.name, VIEW_WIDTH - 74, 172, 'center', 10, SCREEN_COLORS.text);
  text(ctx, 'VS', VIEW_WIDTH / 2, 96, 'center', 26, SCREEN_COLORS.accent);
}

export function drawResult(ctx: Ctx2D, winnerName: string, blinkOn: boolean): void {
  ctx.fillStyle = 'rgba(5,7,10,0.72)';
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  text(ctx, winnerName, VIEW_WIDTH / 2, 84, 'center', 16, SCREEN_COLORS.gold);
  text(ctx, 'WINS', VIEW_WIDTH / 2, 104, 'center', 12, SCREEN_COLORS.text);
  if (blinkOn) text(ctx, '按 A 回到标题', VIEW_WIDTH / 2, 140, 'center', 8, SCREEN_COLORS.dim);
}

/** 选人格子命中测试（鼠标/触屏点选） */
export function hitTestCell(x: number, y: number, count: number, columns = gridColumns(count)): number {
  for (let i = 0; i < count; i++) {
    const r = cellRect(i, count, columns);
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}
