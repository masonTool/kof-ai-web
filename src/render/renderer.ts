/**
 * 一帧的画面组装：舞台 → 角色（世界坐标）→ 特效 → 判定框 → HUD（屏幕坐标）。
 *
 * 只在 `applyTo` 的区间里用世界坐标画，HUD 必须在 restore 之后画——
 * 否则血条会跟着镜头变焦一起放大，那种问题在截图里很明显、在代码里很难看出来。
 */
import { SUPER_FLASH_FRAMES, SUPER_HIT_FRAMES, type Match } from '../game/match';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../sim/constants';
import type { Fighter } from '../sim/fighter';
import { FighterState } from '../sim/state';
import type { Ctx2D } from './ctx';
import { drawFighter } from './fighter-draw';
import { STYLE_COLORS } from './fx';
import { lookFor } from './looks';
import { poseForMove } from './move-anim';
import { drawHud, text } from './hud';
import { STATE_ANIM, winPoseFor } from './poses';
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
export function resultAnimFor(match: Match, side: 1 | 2): string | null {
  if (match.phase !== 'over') return null;
  if (match.matchWinner === 0) return null; // 平局：两边都不摆
  if (match.matchWinner !== side) return 'lose';
  // 赢家按角色选一个胜利姿势变体
  return winPoseFor(side === 1 ? match.p1.char.id : match.p2.char.id);
}

/** 开场演出期间摆挑衅姿势（"来吧"），演出结束就回到正常状态机 */
export function introAnimFor(match: Match): 'taunt' | null {
  return match.phase === 'intro' ? 'taunt' : null;
}

function animFor(f: Fighter, match: Match): { anim: string; elapsed: number; duration?: number } {
  const result = resultAnimFor(match, f === match.p1 ? 1 : 2);
  if (result) return { anim: result, elapsed: f.stateFrame };
  const intro = introAnimFor(match);
  if (intro) return { anim: intro, elapsed: f.stateFrame };
  if (f.isAttacking && f.move) {
    // 必杀的姿势按指令形状分开（数据里都是 'special'，否则四种必杀长得一样）
    return { anim: poseForMove(f.move), elapsed: f.moveFrame, duration: f.move.total };
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

/** 超必杀运镜的上下黑边高度 */
export const CINEMA_BAR = 20;

/** 判定框：红 = 受击，蓝 = 推挤，黄 = 当前生效的攻击判定 */
export function drawDebugBoxes(ctx: Ctx2D, match: Match): void {
  for (const f of match.fighters) {
    const stand = f.char.boxes.stand;
    strokeBox(ctx, f.worldBox(f.hurtbox()), '#ff4d6d');
    strokeBox(ctx, { x: f.x - f.pushWidth / 2, y: f.y + stand.y, w: f.pushWidth, h: stand.h }, '#4d9dff');
    for (const h of f.activeHits()) strokeBox(ctx, f.worldBox(h.box), '#ffe066');
  }
}

/**
 * 挤压拉伸与惯性：让动作有重量。
 * 出招的判定帧纵向拉长（冲刺感），受击前两帧横向压扁（被顶住），落地压一下。
 */
export function squashFor(f: Fighter): { squash: number; lag: number } {
  if (f.state === FighterState.Hit && f.stateFrame < 2) return { squash: -0.8, lag: 0.15 };
  if (f.state === FighterState.Landing) return { squash: -0.5, lag: 0.1 };
  if (f.isAttacking && f.move) {
    const peak = f.move.hits[0]?.frames[0] ?? 0;
    const near = Math.abs(f.moveFrame - peak) <= 2;
    return { squash: near ? 0.7 : 0.2, lag: 0.3 };
  }
  if (f.state === FighterState.Jump) return { squash: 0.35, lag: 0.2 };
  return { squash: 0, lag: 0.18 };
}

/** 道具的配色：按属性取；无属性时用主人的色板 */
function projectileColors(p: Projectile): { core: string; inner: string } {
  if (p.style !== 'none') {
    const colors = STYLE_COLORS[p.style];
    return { core: colors[1]!, inner: colors[0]! };
  }
  return { core: p.owner.char.palette.accent, inner: p.owner.char.palette.trim };
}

/**
 * 按形状画道具。形状差异是"看得出这是谁的招"的关键：
 * 全是圆球的话，火球和音速波看起来一模一样。
 */
export function drawProjectile(ctx: Ctx2D, p: Projectile): void {
  const { core, inner } = projectileColors(p);
  const dir = p.facing;
  // 用剩余寿命做一点脉动，纯函数、回放一致（不用随机数）
  const pulse = 1 + Math.sin(p.life * 0.6) * 0.08;

  // 拖尾：越远的越小越淡（速度感主要靠它；没有拖尾的球看起来像贴纸）
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = core;
  for (let i = 1; i <= 4; i++) {
    ctx.globalAlpha = 0.2 - i * 0.04;
    ctx.beginPath();
    ctx.arc(p.x - dir * i * 9, p.y + Math.sin((p.life - i * 2) * 0.5) * 1.5, 7 - i * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 贴地辉光：让道具"压在地上"，不然像浮在半空
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(p.x, p.owner.y - 1, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (p.shape === 'wave') {
    // 音速波：横向拉长的椭圆 + 两道尾迹
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = core;
    for (const [back, w, h] of [[18, 22, 7], [10, 20, 11]] as const) {
      ctx.beginPath();
      ctx.ellipse(p.x - dir * back, p.y, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 16 * pulse, 12 * pulse, 0, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x + dir * 2, p.y, 8, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = inner;
    ctx.fill();
    return;
  }

  if (p.shape === 'flame') {
    // 火柱：三个自下而上缩小的圆，加一点上下抖动
    ctx.globalAlpha = 0.35;
    for (const [dy, r] of [[6, 10], [-2, 12], [-10, 8]] as const) {
      ctx.beginPath();
      ctx.arc(p.x, p.y + dy, r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = inner;
    ctx.fill();
    return;
  }

  if (p.shape === 'blade') {
    // 风刃：一弯月牙（描边弧）+ 内芯
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = core;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(p.x - dir * 6, p.y, 12, -Math.PI / 2, Math.PI / 2, dir < 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = inner;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x - dir * 4, p.y, 11, -Math.PI / 2.4, Math.PI / 2.4, dir < 0);
    ctx.stroke();
    return;
  }

  // 默认：气弹（外圈 + 内芯 + 尾巴）
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(p.x - dir * 10, p.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

/** 集中线：从四周射向画面中心的细三角（k: 1 → 0 当帧进度） */
function drawSpeedLines(ctx: Ctx2D, k: number, count: number, thick: number): void {
  const cx = VIEW_WIDTH / 2;
  const cy = VIEW_HEIGHT / 2;
  ctx.globalAlpha = 0.5 * k;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (1 - k) * 0.5;
    const outer = 240 - (1 - k) * 40;
    const len = (46 + (i % 3) * 22) * thick;
    const wide = (0.004 + (i % 2) * 0.003) * Math.sqrt(thick);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
    ctx.lineTo(cx + Math.cos(ang - wide) * (outer - len), cy + Math.sin(ang - wide) * (outer - len));
    ctx.lineTo(cx + Math.cos(ang + wide) * (outer - len), cy + Math.sin(ang + wide) * (outer - len));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * 招式名横幅：中上方弹出，「必杀技 / 超必杀」+ 招式名。
 *
 * 进场 4 帧放大到位、末尾 12 帧淡出——不做这个玩家根本不知道自己放出来没有
 * （必杀和普通技在画面上差得不够多，尤其手机小屏）。
 * 超必杀更大、更红、还带一层横线装饰，和"普通必杀"一眼分开。
 */
function drawMoveBanner(
  ctx: Ctx2D,
  b: { name: string; kind: 'special' | 'super'; frames: number; total: number } | null,
): void {
  if (!b) return;
  const t = 1 - b.frames / b.total; // 0 → 1
  const fadeIn = Math.min(1, t / 0.08);
  const fadeOut = Math.min(1, (1 - t) / 0.25);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  if (alpha <= 0) return;

  const superMove = b.kind === 'super';
  const color = superMove ? '#ff5b3d' : '#ffd166';
  const size = superMove ? 15 : 11;
  const y = superMove ? 62 : 64;

  // 进场那一下轻微放大，落定后不再动
  const pop = 1 + (1 - Math.min(1, t / 0.12)) * 0.18;

  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = '#05070a';
  // 中文/日文字宽约等于字号，留 1.25 倍余量 + 左右内边距，别让长招式名溢出边框
  const boxW = Math.min(VIEW_WIDTH - 16, b.name.length * size * 1.25 + 36);
  ctx.fillRect(VIEW_WIDTH / 2 - boxW / 2, y - size - 4, boxW, size + 20);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = superMove ? 1.5 : 1;
  ctx.strokeRect(VIEW_WIDTH / 2 - boxW / 2 + 0.5, y - size - 3.5, boxW - 1, size + 19);

  text(ctx, superMove ? '超必杀' : '必杀技', VIEW_WIDTH / 2, y - size + 1, 'center', 6, color);
  text(ctx, b.name, VIEW_WIDTH / 2, y + 2, 'center', Math.round(size * pop), '#ffffff');
  ctx.globalAlpha = 1;
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
    const motion = squashFor(f);
    drawFighter(ctx, {
      palette: f.char.palette,
      facing: f.facing,
      x: f.x,
      y: f.y,
      anim,
      elapsed,
      duration,
      // 只在"挨打的那一方"刚被打中的 3 帧闪白：
      // 攻击方也闪的话，两个人一起变成白影子，反而看不出谁打了谁
      flash:
        (f.state === FighterState.Hit && f.stateFrame < 3) ||
        // 超必杀起手前 2 帧：施术者整个人亮成剪影，配合闪白和集中线
        (match.superFlash > 0 && f.move?.kind === 'super' && f.stateFrame < 2),
      alpha: f.state === FighterState.Dead ? 0.8 : 1,
      look: lookFor(f.char.id),
      charId: f.char.id,
      lag: motion.lag,
      squash: motion.squash,
    });
  }
  // 飞行道具：按形状画（球/波/火柱/风刃），颜色按属性
  for (const entity of match.world.entities) {
    if (!(entity instanceof Projectile) || entity.dead) continue;
    drawProjectile(ctx, entity);
  }

  match.fx.draw(ctx);
  if (opts.showBoxes === true) drawDebugBoxes(ctx, match);
  ctx.restore();

  drawHud(ctx, match.toHudModel());
  drawMoveBanner(ctx, match.moveBanner);

  // 超必杀起手：先闪白（盖住 HUD），再压上下黑边——
  // 顺序反过来的话黑边也会被闪白冲淡，看着像灰条而不是电影黑边
  if (match.superHit > 0 || match.superFlash > 0) {
    // 命中特写比起手更狠：更白、集中线更多更粗
    const hit = match.superHit > 0;
    const k = hit ? match.superHit / SUPER_HIT_FRAMES : match.superFlash / SUPER_FLASH_FRAMES;
    const peak = hit ? 0.44 : 0.42;
    ctx.fillStyle = `rgba(255,255,255,${(k * peak).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    // 集中线：细而密，才有"速度线"的味道；太粗会像碎玻璃
    drawSpeedLines(ctx, k, hit ? 48 : 30, hit ? 1.6 : 1.1);

    // 抢眼的暗角：把注意力压到画面中心（特写时才加，起手阶段不加）
    if (hit) {
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = '#000000';
      for (const [y, h] of [[0, 26], [VIEW_HEIGHT - 26, 26]] as const) ctx.fillRect(0, y, VIEW_WIDTH, h);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, VIEW_WIDTH, CINEMA_BAR);
    ctx.fillRect(0, VIEW_HEIGHT - CINEMA_BAR, VIEW_WIDTH, CINEMA_BAR);
  }
}
