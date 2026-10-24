import { describe, expect, it } from 'vitest';
import { VIEW_WIDTH } from '../src/sim/constants';
import {
  HUD_COLORS,
  HUD_LAYOUT,
  comboLabel,
  depletedWidth,
  drawHud,
  formatTimer,
  hpBarLayout,
  hpRatio,
  meterBarLayout,
  meterRatio,
  type HudModel,
  type PlayerHud,
} from '../src/render/hud';
import { FakeCtx } from './helpers/fake-ctx';

function player(over: Partial<PlayerHud> = {}): PlayerHud {
  return {
    name: 'KYO',
    hp: 1000,
    maxHp: 1000,
    meter: 0,
    maxMeter: 100,
    teamLeft: 0,
    wins: 0,
    ...over,
  };
}

function model(over: Partial<HudModel> = {}): HudModel {
  return { timer: 99, p1: player(), p2: player({ name: 'IORI' }), ...over };
}

/** 某块区域里指定填充色的矩形 */
function rectsAt(ctx: FakeCtx, y: number, fill: string) {
  return ctx.rects.filter((r) => r.y === y && r.fill === fill);
}

describe('数值映射', () => {
  it('血量比例夹在 0~1', () => {
    expect(hpRatio(player())).toBe(1);
    expect(hpRatio(player({ hp: 500 }))).toBe(0.5);
    expect(hpRatio(player({ hp: 0 }))).toBe(0);
    expect(hpRatio(player({ hp: -50 }))).toBe(0);
    expect(hpRatio(player({ hp: 5000 }))).toBe(1);
    expect(hpRatio(player({ maxHp: 0, hp: 10 }))).toBe(0);
  });

  it('气槽比例同理', () => {
    expect(meterRatio(player({ meter: 50, maxMeter: 100 }))).toBe(0.5);
    expect(meterRatio(player({ meter: 999, maxMeter: 100 }))).toBe(1);
    expect(meterRatio(player({ meter: 0 }))).toBe(0);
    expect(meterRatio(player({ maxMeter: 0 }))).toBe(0);
  });

  it('计时器两位补零并夹在 0~99', () => {
    expect(formatTimer(99)).toBe('99');
    expect(formatTimer(9)).toBe('09');
    expect(formatTimer(0)).toBe('00');
    expect(formatTimer(-3)).toBe('00');
    expect(formatTimer(123)).toBe('99');
    expect(formatTimer(4.9)).toBe('04');
  });

  it('连击提示 2 段起才有', () => {
    expect(comboLabel(0)).toBeNull();
    expect(comboLabel(1)).toBeNull();
    expect(comboLabel(2)).toBe('2 HITS');
    expect(comboLabel(7.8)).toBe('7 HITS');
    expect(comboLabel(Number.NaN)).toBeNull();
  });

  it('血条布局左右分离、气槽在下', () => {
    const p1 = hpBarLayout(1);
    const p2 = hpBarLayout(2);
    expect(p1.x).toBe(HUD_LAYOUT.margin);
    expect(p1.w).toBe(p2.w);
    expect(p2.x + p2.w).toBe(VIEW_WIDTH - HUD_LAYOUT.margin);
    expect(p1.x + p1.w).toBeLessThan(p2.x); // 中间一格留给计时器
    expect(p2.x).toBe(VIEW_WIDTH - HUD_LAYOUT.margin - p2.w);
    expect(hpBarLayout(1).y).toBe(hpBarLayout(2).y);
    expect(meterBarLayout(1).y).toBeGreaterThan(hpBarLayout(1).y);
  });

  it('空掉的血条宽度按比例算', () => {
    const rect = hpBarLayout(1);
    expect(depletedWidth(rect, 1)).toBe(0);
    expect(depletedWidth(rect, 0.5)).toBe(Math.round(rect.w * 0.5));
    expect(depletedWidth(rect, 0)).toBe(rect.w);
    expect(depletedWidth(rect, 2)).toBe(0);
  });
});

describe('绘制血条', () => {
  it('满血：整条填满，P1 从左、P2 从右', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model());
    const p1 = hpBarLayout(1);
    const p2 = hpBarLayout(2);

    expect(rectsAt(ctx, p1.y, HUD_COLORS.barFill)).toContainEqual({ ...p1, fill: HUD_COLORS.barFill });
    const p2rect = rectsAt(ctx, p2.y, HUD_COLORS.barFill).find((r) => r.x !== p1.x)!;
    expect(p2rect.x + p2rect.w).toBe(p2.x + p2.w);
    expect(p2rect.w).toBe(p2.w);
  });

  it('半血：宽度一半；P2 从右往左缩（左端留出空缺）', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ p2: player({ name: 'IORI', hp: 500 }) }));
    const p2 = hpBarLayout(2);
    const bar = rectsAt(ctx, p2.y, HUD_COLORS.barFill).find((r) => r.w < p2.w)!;
    expect(bar.w).toBe(Math.round(p2.w * 0.5));
    expect(bar.x).toBe(p2.x + p2.w - bar.w);
  });

  it('掉血残影画在内侧', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ p1: player({ hp: 500, trail: 0.8 }) }));
    const p1 = hpBarLayout(1);
    const trail = rectsAt(ctx, p1.y, HUD_COLORS.trail);
    expect(trail).toHaveLength(1);
    expect(trail[0]!.w).toBe(Math.round(p1.w * 0.3));
    expect(trail[0]!.x).toBe(p1.x + Math.round(p1.w * 0.5));
  });

  it('KO：血条一根都不画（宽度 0），不会残留', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ p1: player({ hp: 0, ko: true }) }));
    const p1 = hpBarLayout(1);
    const filled = ctx.rects.filter(
      (r) => r.y === p1.y && r.x < VIEW_WIDTH / 2 && (r.fill === HUD_COLORS.barFill || r.fill === HUD_COLORS.barLow),
    );
    expect(filled).toHaveLength(0);
    // 底槽仍然在（否则会缺一块）
    expect(rectsAt(ctx, p1.y, HUD_COLORS.barBack)).toHaveLength(2);
  });

  it('血量低于 1/4 变红', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ p1: player({ hp: 200 }) }));
    const p1 = hpBarLayout(1);
    const left = (fill: string) => ctx.rects.filter((r) => r.y === p1.y && r.x < VIEW_WIDTH / 2 && r.fill === fill);
    expect(left(HUD_COLORS.barLow)).toHaveLength(1);
    expect(left(HUD_COLORS.barFill)).toHaveLength(0);
  });

  it('名字左右对齐，队伍人数与胜场画成小方块', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ p1: player({ teamLeft: 2, wins: 1 }) }));
    expect(ctx.lastText('KYO')!.align).toBe('left');
    expect(ctx.lastText('IORI')!.align).toBe('right');
    // 2 个队员图标 + 1 颗星
    const p1 = hpBarLayout(1);
    expect(ctx.rects.filter((r) => r.y >= HUD_LAYOUT.nameY).length).toBeGreaterThanOrEqual(3);
    expect(ctx.rects.some((r) => r.y === p1.y - 7)).toBe(true);
  });
});

describe('气槽与计时器', () => {
  it('气槽没满显示 POWER，满了显示 MAX 并用高亮色', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ p1: player({ meter: 0 }), p2: player({ name: 'IORI', meter: 100 }) }));
    expect(ctx.lastText('POWER')!.color).toBe(HUD_COLORS.text);
    expect(ctx.lastText('MAX')!.color).toBe(HUD_COLORS.meterMax);
  });

  it('气槽按比例填充，满槽整条高亮', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ p2: player({ name: 'IORI', meter: 100 }) }));
    const rect = meterBarLayout(2);
    const full = rectsAt(ctx, rect.y, HUD_COLORS.meterMax);
    expect(full).toHaveLength(1);
    expect(full[0]!.w).toBe(rect.w);

    const half = new FakeCtx();
    drawHud(half, model({ p1: player({ meter: 50 }) }));
    const r1 = meterBarLayout(1);
    const halfBar = rectsAt(half, r1.y, HUD_COLORS.meterFill);
    expect(halfBar[0]!.w).toBe(Math.round(r1.w * 0.5));
  });

  it('计时器居中显示，10 秒内变红', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ timer: 99 }));
    const t = ctx.lastText('99')!;
    expect(t.align).toBe('center');
    expect(t.x).toBe(VIEW_WIDTH / 2);
    expect(t.color).toBe(HUD_COLORS.text);

    const urgent = new FakeCtx();
    drawHud(urgent, model({ timer: 5 }));
    expect(urgent.lastText('05')!.color).toBe(HUD_COLORS.barLow);
  });
});

describe('连击与横幅', () => {
  it('连击数 < 2 不显示', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ combo: { side: 1, hits: 1 } }));
    expect(ctx.texts.some((t) => t.text.includes('HITS'))).toBe(false);
  });

  it('P1 的连击显示在左侧、P2 在右侧，并带伤害', () => {
    const left = new FakeCtx();
    drawHud(left, model({ combo: { side: 1, hits: 3, damage: 128 } }));
    expect(left.lastText('3 HITS')!.x).toBeLessThan(VIEW_WIDTH / 2);
    expect(left.lastText('128 DMG')).toBeDefined();

    const right = new FakeCtx();
    drawHud(right, model({ combo: { side: 2, hits: 4 } }));
    expect(right.lastText('4 HITS')!.x).toBeGreaterThan(VIEW_WIDTH / 2);
  });

  it('横幅（KO / TIME UP）居中', () => {
    const ctx = new FakeCtx();
    drawHud(ctx, model({ banner: 'K.O.' }));
    const b = ctx.lastText('K.O.')!;
    expect(b.align).toBe('center');
    expect(b.x).toBe(VIEW_WIDTH / 2);
  });
});
