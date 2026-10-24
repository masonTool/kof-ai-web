/**
 * 舞台：程序化背景（天空色带 + 视差楼群 + 中景墙 + 地面砖）。
 *
 * 背景层用**屏幕坐标**画并按视差系数偏移（远层慢、近层快），
 * 地面用镜头的 `worldToScreenX()` 画——这样地砖和角色踩在同一套坐标上，不会"脚底滑动"。
 * 舞台是纯数据 + 一个绘制函数：换舞台只加一条数据。
 */
import { Rng } from '../core/rng';
import { GROUND_Y, VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import { GROUND_SCREEN_Y, type Camera } from '../sim/camera';
import type { Ctx2D } from './ctx';

export interface StageBuilding {
  x: number;
  w: number;
  h: number;
  /** 窗户灯的数量（0 = 没有灯） */
  lights: number;
}

export interface StageDef {
  id: string;
  name: string;
  /** 天空上/下段颜色 */
  skyTop: string;
  skyBottom: string;
  /** 远景楼色 / 中景墙色 */
  far: string;
  mid: string;
  /** 地面主色 / 砖缝色 */
  ground: string;
  groundLine: string;
  /** 点缀色（窗户灯、招牌） */
  accent: string;
  /** 地平线所在的屏幕行 */
  horizon: number;
  buildings: readonly StageBuilding[];
}

function skyline(seed: number, count: number, minH: number, maxH: number): StageBuilding[] {
  const rng = new Rng(seed);
  const out: StageBuilding[] = [];
  let x = -100;
  for (let i = 0; i < count; i++) {
    const w = rng.range(26, 62);
    out.push({ x, w, h: rng.range(minH, maxH), lights: rng.range(0, 5) });
    x += w + rng.range(4, 24);
  }
  return out;
}

export const STAGES: readonly StageDef[] = [
  {
    id: 'skyline',
    name: '摩天楼 · 夜',
    skyTop: '#0a1030',
    skyBottom: '#1d2b52',
    far: '#131a33',
    mid: '#1f2a45',
    ground: '#22242c',
    groundLine: '#333849',
    accent: '#ffd166',
    horizon: 150,
    buildings: skyline(0x97a1, 14, 30, 86),
  },
  {
    id: 'valley',
    name: '溪谷 · 黄昏',
    skyTop: '#2b1b3d',
    skyBottom: '#7a3f4d',
    far: '#3c2438',
    mid: '#4a2f33',
    ground: '#3a2c23',
    groundLine: '#54402f',
    accent: '#ffb36b',
    horizon: 146,
    buildings: skyline(0x5eed, 12, 18, 58),
  },
  {
    id: 'arena',
    name: '斗技场',
    skyTop: '#101418',
    skyBottom: '#243040',
    far: '#1a2129',
    mid: '#28323d',
    ground: '#2b2620',
    groundLine: '#443a2c',
    accent: '#8fe3ff',
    horizon: 152,
    buildings: skyline(0xa11ce, 10, 14, 44),
  },
];

/** 视差系数：0 = 完全不动（天空），1 = 和角色同一层（地面） */
export const PARALLAX_FAR = 0.35;
export const PARALLAX_MID = 0.6;
/** 地砖间距（世界单位） */
export const TILE_SPACING = 24;

export function drawStage(ctx: Ctx2D, cam: Camera, stage: StageDef = STAGES[0]!): void {
  // 天空：两段色带（不做渐变，像素风更接近原版）
  ctx.fillStyle = stage.skyTop;
  ctx.fillRect(0, 0, VIEW_WIDTH, stage.horizon);
  ctx.fillStyle = stage.skyBottom;
  ctx.fillRect(0, stage.horizon, VIEW_WIDTH, GROUND_SCREEN_Y - stage.horizon);

  // 远景楼群（慢速视差）
  const farShift = cam.x * PARALLAX_FAR;
  for (const b of stage.buildings) {
    const sx = Math.round(b.x - farShift + VIEW_WIDTH / 2);
    if (sx > VIEW_WIDTH || sx + b.w < 0) continue;
    ctx.fillStyle = stage.far;
    ctx.fillRect(sx, stage.horizon - b.h, b.w, b.h);

    if (b.lights > 0) {
      ctx.fillStyle = stage.accent;
      for (let i = 0; i < b.lights; i++) {
        const wy = stage.horizon - b.h + 6 + i * 10;
        if (wy > stage.horizon - 6) break;
        ctx.fillRect(sx + 4, wy, 3, 4);
        ctx.fillRect(sx + b.w - 8, wy, 3, 4);
      }
    }
  }

  // 中景墙（稍快），带一列立柱
  const midShift = cam.x * PARALLAX_MID;
  ctx.fillStyle = stage.mid;
  ctx.fillRect(0, stage.horizon + 18, VIEW_WIDTH, GROUND_SCREEN_Y - stage.horizon - 18);
  ctx.fillStyle = stage.groundLine;
  for (let wx = -64; wx < VIEW_WIDTH + 64; wx += 48) {
    const sx = Math.round(wx - midShift + VIEW_WIDTH / 2);
    if (sx > VIEW_WIDTH || sx < -8) continue;
    ctx.fillRect(sx, stage.horizon + 18, 5, GROUND_SCREEN_Y - stage.horizon - 18);
  }

  // 地面（和角色同一层视差）
  ctx.fillStyle = stage.ground;
  ctx.fillRect(0, GROUND_SCREEN_Y, VIEW_WIDTH, VIEW_HEIGHT - GROUND_SCREEN_Y);

  // 地面砖缝：用镜头换算，保证砖随镜头移动
  const left = cam.visibleLeft;
  const first = Math.floor(left / TILE_SPACING) * TILE_SPACING;
  ctx.strokeStyle = stage.groundLine;
  ctx.lineWidth = 1;
  for (let wx = first; wx < cam.visibleRight + TILE_SPACING; wx += TILE_SPACING) {
    const sx = Math.round(cam.worldToScreenX(wx)) + 0.5;
    if (sx < -1 || sx > VIEW_WIDTH + 1) continue;
    ctx.beginPath();
    ctx.moveTo(sx, GROUND_SCREEN_Y);
    ctx.lineTo(sx, VIEW_HEIGHT);
    ctx.stroke();
  }

  // 地平线高光
  ctx.fillStyle = stage.groundLine;
  ctx.fillRect(0, GROUND_Y, VIEW_WIDTH, 1);
}

export function stageById(id: string): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]!;
}
