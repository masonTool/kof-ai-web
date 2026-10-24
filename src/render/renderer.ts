/**
 * 一帧的画面组装：舞台 → 角色（世界坐标）→ 特效 → 判定框 → HUD（屏幕坐标）。
 *
 * 只在 `applyTo` 的区间里用世界坐标画，HUD 必须在 restore 之后画——
 * 否则血条会跟着镜头变焦一起放大，那种问题在截图里很明显、在代码里很难看出来。
 */
import type { Match } from '../game/match';
import type { Fighter } from '../sim/fighter';
import { FighterState } from '../sim/state';
import type { Ctx2D } from './ctx';
import { drawFighter } from './fighter-draw';
import { STYLE_COLORS } from './fx';
import { lookFor } from './looks';
import { drawHud } from './hud';
import { STATE_ANIM } from './poses';
import { STAGES, drawStage, type StageDef } from './stage-draw';
import { Projectile } from '../sim/projectile';

export interface RenderOptions {
  stage?: StageDef;
  /** 画判定框（训练模式） */
  showBoxes?: boolean;
}

/**
 * 整场结束后的姿势：赢家摆胜利姿势、输家跪地。
 * 纯函数单独导出，方便断言"结束那一刻谁该摆什么"，而不是靠截图看。
 */
export function resultAnimFor(match: Match, side: 1 | 2): 'win' | 'lose' | null {
  if (match.phase !== 'over') return null;
  if (match.matchWinner === 0) return null; // 平局：两边都不摆
  return match.matchWinner === side ? 'win' : 'lose';
}

function animFor(f: Fighter, match: Match): { anim: string; elapsed: number; duration?: number } {
  const result = resultAnimFor(match, f === match.p1 ? 1 : 2);
  if (result) return { anim: result, elapsed: f.stateFrame };
  if (f.isAttacking && f.move) {
    return { anim: f.move.anim, elapsed: f.moveFrame, duration: f.move.total };
  }
  return { anim: STATE_ANIM[f.state] ?? 'idle', elapsed: f.stateFrame };
}

function strokeBox(ctx: Ctx2D, box: { x: number; y: number; w: number; h: number }, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x + box.w, box.y);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.closePath();
  ctx.stroke();
}

/** 判定框：红 = 受击，蓝 = 推挤，黄 = 当前生效的攻击判定 */
export function drawDebugBoxes(ctx: Ctx2D, match: Match): void {
  for (const f of match.fighters) {
    const stand = f.char.boxes.stand;
    strokeBox(ctx, f.worldBox(f.hurtbox()), '#ff4d6d');
    strokeBox(ctx, { x: f.x - f.pushWidth / 2, y: f.y + stand.y, w: f.pushWidth, h: stand.h }, '#4d9dff');
    for (const h of f.activeHits()) strokeBox(ctx, f.worldBox(h.box), '#ffe066');
  }
}

export function drawFrame(ctx: Ctx2D, match: Match, opts: RenderOptions = {}): void {
  const stage = opts.stage ?? STAGES[0]!;

  ctx.save();
  drawStage(ctx, match.cam, stage);
  ctx.restore();

  ctx.save();
  match.cam.applyTo(ctx);
  for (const f of match.fighters) {
    const { anim, elapsed, duration } = animFor(f, match);
    drawFighter(ctx, {
      palette: f.char.palette,
      facing: f.facing,
      x: f.x,
      y: f.y,
      anim,
      elapsed,
      duration,
      flash: f.hitstop > 2,
      alpha: f.state === FighterState.Dead ? 0.8 : 1,
      look: lookFor(f.char.id),
    });
  }
  // 飞行道具：外圈发光 + 内芯，按朝向拖一条尾巴；颜色按属性（火/雷/气）区分
  for (const entity of match.world.entities) {
    if (!(entity instanceof Projectile) || entity.dead) continue;
    const p = entity;
    const theme = p.owner.char.palette;
    const style = p.style;
    const core = style === 'none' ? theme.accent : STYLE_COLORS[style][1]!;
    const inner = style === 'none' ? theme.trim : STYLE_COLORS[style][0]!;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(p.x - p.facing * 10, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  match.fx.draw(ctx);
  if (opts.showBoxes === true) drawDebugBoxes(ctx, match);
  ctx.restore();

  drawHud(ctx, match.toHudModel());
}
