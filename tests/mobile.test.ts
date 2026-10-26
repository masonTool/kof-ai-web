import { FakeCtx } from './helpers/fake-ctx';
import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, computeViewport } from '../src/render/scale';
import { NO_PAD_INSETS, padLayout } from '../src/ui/pad-layout';
import { HUD_LAYOUT } from '../src/render/hud';
import {
  setViewWidthByAspect,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  VIEW_WIDTH_MAX,
  VIEW_WIDTH_MIN,
} from '../src/sim/constants';
import {
  hitTestCell,
  selectGridRect,
  PAD_RESET_BUTTON,
  PAD_SAVE_BUTTON,
  OPT_ROW_GAP,
  OPT_ROW_TOP,
  menuButtonRect,
  movesButtonRect,
  drawComboMeter,
  drawDemoResult,
  drawLoadingHint,
  drawStageBadge,
  drawLoadingScreen,
  drawTrainingBadge,
  MOVE_HINT_TEXT,
  drawMoveHint,
  HELP_BUTTON,
  HELP_PAGE_COUNT,
  helpPageText,
  hitTestModeItem,
  hitTestOptionRow,
  hitTestPauseItem,
} from '../src/render/screens';
import { MODE_ITEMS } from '../src/ui/flow';
import { menuItems } from '../src/ui/pause';

describe('铺满模式（手机）', () => {
  it('手机上不取整数倍，画面尽量填满（整数倍会缩成 320×224 蹲在黑边里）', () => {
    const phone = computeViewport(844, 390, 2, undefined, { fill: true });
    const integer = computeViewport(844, 390, 2);
    expect(phone.scale).toBeGreaterThan(integer.scale);
    expect(phone.cssHeight).toBeCloseTo(390, 0); // 高度方向铺满
    expect(phone.scale).toBeLessThan(2); // 但不是整数倍
  });

  it('桌面保持整数倍（像素画锐利），两种模式互不影响', () => {
    const crisp = computeViewport(1280, 720, 1);
    expect(crisp.scale).toBe(Math.floor(Math.min(1280 / LOGICAL_WIDTH, 720 / LOGICAL_HEIGHT)));
    const filled = computeViewport(1280, 720, 1, undefined, { fill: true });
    expect(filled.scale).toBeGreaterThan(crisp.scale);
  });

  it('竖屏铺满时宽度吃满、高度留黑（长宽比不变，不拉伸画面）', () => {
    const vp = computeViewport(390, 844, 2, undefined, { fill: true });
    expect(vp.cssWidth).toBeCloseTo(390, 0);
    expect(vp.cssWidth / vp.cssHeight).toBeCloseTo(LOGICAL_WIDTH / LOGICAL_HEIGHT, 3);
  });
});

describe('菜单点选（触屏）', () => {
  it('模式菜单：点在第 i 行就返回 i', () => {
    for (let i = 0; i < MODE_ITEMS.length; i++) {
      const y = 76 + i * 26; // 与 drawMode 的行距一致
      expect(hitTestModeItem(160, y)).toBe(i);
    }
    expect(hitTestModeItem(160, 10)).toBe(-1);
    expect(hitTestModeItem(2, 76)).toBe(-1); // 左边距之外（留给摇杆）
  });

  it('选项屏：每一行都能点中，且 12 行全部落在手台上沿之上', () => {
    const rows = 12 + 1; // 12 项设置 + 「按键设置」
    for (let i = 0; i < rows; i++) {
      expect(hitTestOptionRow(160, OPT_ROW_TOP + i * OPT_ROW_GAP, rows)).toBe(i);
    }
    expect(hitTestOptionRow(160, 8, rows)).toBe(-1);
    // 关键：最后一行不能被摇杆/四键盖住（手台上沿约在逻辑 y=159）
    const lastRowY = OPT_ROW_TOP + (rows - 1) * OPT_ROW_GAP;
    expect(lastRowY).toBeLessThan(155);
  });

  it('暂停菜单：点第 i 项返回 i', () => {
    for (let i = 0; i < menuItems('fight').length; i++) {
      expect(hitTestPauseItem(160, 100 + i * 24, menuItems('fight').length)).toBe(i);
    }
    expect(hitTestPauseItem(160, 60, menuItems('fight').length)).toBe(-1);
  });

  it('相邻两行的命中带不重叠（点一个不会误选隔壁）', () => {
    const n = menuItems('fight').length;
    for (let i = 0; i < n - 1; i++) {
      const a = 100 + i * 24;
      const b = 100 + (i + 1) * 24;
      // 两行之间任意一点只属于其中一行
      for (let y = a; y <= b; y++) {
        const hit = hitTestPauseItem(160, y, n);
        expect(hit === i || hit === i + 1).toBe(true);
      }
    }
  });
});

describe('说明浮层', () => {
  it('页数与文案齐全，越界也能取到合法页（不会因为索引越界画空白）', () => {
    expect(HELP_PAGE_COUNT).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < HELP_PAGE_COUNT; i++) {
      const p = helpPageText(i);
      expect(p.title.length, String(i)).toBeGreaterThan(0);
      expect(p.lines.length, String(i)).toBeGreaterThan(0);
    }
    expect(helpPageText(-5)).toEqual(helpPageText(0));
    expect(helpPageText(99)).toEqual(helpPageText(HELP_PAGE_COUNT - 1));
  });

  it('说明内容覆盖用户要的四件事：目标 / 操作 / 必杀 / 气槽', () => {
    const all = Array.from({ length: HELP_PAGE_COUNT }, (_, i) => helpPageText(i).title + helpPageText(i).lines.join('')).join('');
    for (const kw of ['3 打 3', 'A 轻拳', '↓↘→', '气']) {
      expect(all, kw).toContain(kw);
    }
  });

  it('「怎么玩」按钮在屏幕内', () => {
    expect(HELP_BUTTON.x + HELP_BUTTON.w).toBeLessThanOrEqual(320);
    expect(HELP_BUTTON.y + HELP_BUTTON.h).toBeLessThanOrEqual(224);
  });
});

describe('首次必杀提示', () => {
  it('提示文案点名了「招式」入口，玩家知道去哪儿看', () => {
    expect(MOVE_HINT_TEXT).toContain('招式');
    expect(MOVE_HINT_TEXT).toMatch(/L|点/);
  });

  it('能画出来（底板 + 文字），且会把 globalAlpha 还原', () => {
    const ctx = new FakeCtx();
    drawMoveHint(ctx, 1);
    expect(ctx.texts.some((t) => String(t.text).includes('招式'))).toBe(true);
    expect(ctx.rects.length).toBeGreaterThanOrEqual(1);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('说明浮层', () => {
  it('页数与文案齐全，越界也能取到合法页（不会因为索引越界画空白）', () => {
    expect(HELP_PAGE_COUNT).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < HELP_PAGE_COUNT; i++) {
      const p = helpPageText(i);
      expect(p.title.length, String(i)).toBeGreaterThan(0);
      expect(p.lines.length, String(i)).toBeGreaterThan(0);
    }
    expect(helpPageText(-5)).toEqual(helpPageText(0));
    expect(helpPageText(99)).toEqual(helpPageText(HELP_PAGE_COUNT - 1));
  });

  it('说明内容覆盖用户要的四件事：目标 / 操作 / 必杀 / 气槽', () => {
    const all = Array.from({ length: HELP_PAGE_COUNT }, (_, i) => helpPageText(i).title + helpPageText(i).lines.join('')).join('');
    for (const kw of ['3 打 3', 'A 轻拳', '↓↘→', '气']) {
      expect(all, kw).toContain(kw);
    }
  });

  it('「怎么玩」按钮在屏幕内', () => {
    expect(HELP_BUTTON.x + HELP_BUTTON.w).toBeLessThanOrEqual(320);
    expect(HELP_BUTTON.y + HELP_BUTTON.h).toBeLessThanOrEqual(224);
  });
});

describe('首次必杀提示', () => {
  it('提示文案点名了「招式」入口，玩家知道去哪儿看', () => {
    expect(MOVE_HINT_TEXT).toContain('招式');
    expect(MOVE_HINT_TEXT).toMatch(/L|点/);
  });

  it('能画出来（底板 + 文字），且会把 globalAlpha 还原', () => {
    const ctx = new FakeCtx();
    drawMoveHint(ctx, 1);
    expect(ctx.texts.some((t) => String(t.text).includes('招式'))).toBe(true);
    expect(ctx.rects.length).toBeGreaterThanOrEqual(1);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('宽屏适配：可视宽度随长宽比变化', () => {
  const reset = (): void => void setViewWidthByAspect(320, 224);

  it('16:9 屏幕上看到 398×224（比 4:3 宽，不留左右黑边）', () => {
    reset();
    expect(setViewWidthByAspect(1280, 720)).toBe(398);
    expect(VIEW_WIDTH).toBe(398);
  });

  it('4:3 屏幕保持 320（不多看也不少看）', () => {
    expect(setViewWidthByAspect(640, 448)).toBe(320);
  });

  it('超宽屏夹在上限，竖屏夹在下限（不会露出舞台外）', () => {
    expect(setViewWidthByAspect(2560, 720)).toBe(VIEW_WIDTH_MAX);
    expect(setViewWidthByAspect(390, 844)).toBe(VIEW_WIDTH_MIN);
  });

  it('手机（铺满模式）下画面正好吃满窗口：加宽就是为了这个', () => {
    setViewWidthByAspect(1280, 720);
    const vp = computeViewport(1280, 720, 1, undefined, { fill: true });
    expect(vp.cssWidth).toBeCloseTo(1280, -0.5);
    expect(vp.cssHeight).toBeCloseTo(720, -0.5);
    expect(vp.cssWidth / vp.cssHeight).toBeCloseTo(VIEW_WIDTH / VIEW_HEIGHT, 2);
    reset();
  });

  it('桌面仍走整数倍（像素画要锐利），但因为看宽了，留白比 4:3 时更少', () => {
    setViewWidthByAspect(1280, 720);
    const wide = computeViewport(1280, 720, 1);
    setViewWidthByAspect(640, 448); // 回到 4:3
    const narrow = computeViewport(1280, 720, 1);
    expect(wide.scale).toBeGreaterThanOrEqual(narrow.scale);
    expect(wide.cssWidth).toBeGreaterThan(narrow.cssWidth);
    reset();
  });

  it('高度不变：加宽只影响"看多宽"，判定/跳跃的垂直空间没动', () => {
    reset();
    const before = VIEW_HEIGHT;
    setViewWidthByAspect(2560, 720);
    expect(VIEW_HEIGHT).toBe(before);
    expect(VIEW_HEIGHT).toBe(224);
    reset();
  });
});

describe('训练场状态条', () => {
  it('把"不损血 / 气无限"常驻显示出来（开关埋在按钮里没人知道）', () => {
    const ctx = new FakeCtx();
    drawTrainingBadge(ctx, { infiniteHp: true, infiniteMeter: true, dummy: 'cpu', goal: '自由练习', hint: '随便打' });
    const all = ctx.texts.map((t) => String(t.text)).join('');
    expect(all).toContain('训练场');
    expect(all).toContain('不损血');
    expect(all).toContain('气无限');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('关掉时如实显示"正常血量"，不能骗玩家', () => {
    const ctx = new FakeCtx();
    drawTrainingBadge(ctx, { infiniteHp: false, infiniteMeter: false, dummy: 'stand', goal: '练招式', hint: '按 L 看招式表' });
    const all = ctx.texts.map((t) => String(t.text)).join('');
    expect(all).toContain('正常血量');
    expect(all).not.toContain('不损血');
  });
});

describe('训练场连击面板', () => {
  it('显示当前连击与本次最高（练习的人才知道自己连上没有）', () => {
    const ctx = new FakeCtx();
    drawComboMeter(ctx, 7, 12);
    const all = ctx.texts.map((t) => String(t.text)).join('');
    expect(all).toContain('7 连');
    expect(all).toContain('最高 12');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('没有连击时显示占位而不是 0（0 连看起来像报错）', () => {
    const ctx = new FakeCtx();
    drawComboMeter(ctx, 0, 5);
    const all = ctx.texts.map((t) => String(t.text)).join('');
    expect(all).not.toContain('0 连');
    expect(all).toContain('最高 5');
  });

  it('面板贴在右上角，不和左侧的训练场状态条重叠', () => {
    const ctx = new FakeCtx();
    drawComboMeter(ctx, 3, 3);
    const panel = ctx.rects[0]!;
    expect(panel.x).toBeGreaterThan(VIEW_WIDTH / 2);
    expect(panel.x + panel.w).toBeLessThanOrEqual(VIEW_WIDTH);
  });
});

describe('演示结果回报', () => {
  it('连上了：报"连上了 + N 连 + 伤害"', () => {
    const ctx = new FakeCtx();
    drawDemoResult(ctx, 7, 320);
    const all = ctx.texts.map((t) => String(t.text)).join('|');
    expect(all).toContain('连上了');
    expect(all).toContain('7 连');
    expect(all).toContain('320 伤害');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('没连上时明确说"没连上"（而不是显示 0 连让人以为出 bug）', () => {
    const ctx = new FakeCtx();
    drawDemoResult(ctx, 0, 0);
    const all = ctx.texts.map((t) => String(t.text)).join('|');
    expect(all).toContain('没连上');
  });
});

describe('街机进度显示', () => {
  it('报出第几场 + 对手队名（打 8 场时不用靠记忆）', () => {
    const ctx = new FakeCtx();
    drawStageBadge(ctx, 3, 8, '怒之队');
    const all = ctx.texts.map((t) => String(t.text)).join('|');
    expect(all).toContain('STAGE 3/8');
    expect(all).toContain('怒之队');
    expect(ctx.globalAlpha).toBe(1);
  });

  it('队名为空时不显示多余的分隔符', () => {
    const ctx = new FakeCtx();
    drawStageBadge(ctx, 1, 8, '');
    const all = ctx.texts.map((t) => String(t.text)).join('|');
    expect(all).toContain('STAGE 1/8');
    expect(all).not.toContain('·');
  });

  it('面板在左侧且不越界（右侧留给训练场连击面板）', () => {
    const ctx = new FakeCtx();
    drawStageBadge(ctx, 8, 8, '大蛇');
    const panel = ctx.rects[0]!;
    expect(panel.x).toBeLessThan(VIEW_WIDTH / 2);
    expect(panel.x + panel.w).toBeLessThanOrEqual(VIEW_WIDTH);
  });
});

describe('贴图加载提示', () => {
  it('画一条"加载中"提示，且 alpha 还原（不让整屏半透明）', () => {
    const ctx = new FakeCtx();
    drawLoadingHint(ctx, true);
    const all = ctx.texts.map((t) => String(t.text)).join('|');
    expect(all).toContain('加载中');
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('画面内按钮位置（从左上角挪到右上）', () => {
  it('两个按钮并排在底部中间，且跟着可视宽度走（不是加载时快照）', () => {
    setViewWidthByAspect(1280, 720); // → 398
    const wide = VIEW_WIDTH;
    const mb = movesButtonRect();
    const nb = menuButtonRect();
    // 都在画面内，由左到右："招式" 在 "暂停" 左边
    expect(mb.x).toBeGreaterThanOrEqual(0);
    expect(nb.x + nb.w).toBeLessThanOrEqual(wide);
    expect(mb.x + mb.w).toBeLessThanOrEqual(nb.x);

    setViewWidthByAspect(320, 240); // → 320 基准
    expect(menuButtonRect().x).toBeLessThan(nb.x + 1); // 跟着变窄
  });

  it('放在底部中间：不压血条/气槽，也避开左右两个手台', () => {
    const mb = movesButtonRect();
    // 血条 + 气槽都在顶部
    expect(mb.y).toBeGreaterThan(HUD_LAYOUT.meterY + HUD_LAYOUT.meterH);
    // 左边摇杆、右边四键大约各占 90px，按钮必须落在中间那段
    expect(mb.x).toBeGreaterThan(90);
    expect(mb.x + mb.w).toBeLessThan(VIEW_WIDTH - 85);
    // 和「暂停」不重叠
    const pause = menuButtonRect();
    expect(mb.x + mb.w).toBeLessThanOrEqual(pause.x);
  });
});

describe('选人屏网格（全角色列出 + 左侧大特写）', () => {
  it('29 个角色排成 6 列网格，格子互不重叠', () => {
    const count = 29;
    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      const r = selectGridRect(i, count);
      const key = `${r.x},${r.y}`;
      expect(seen.has(key), `第 ${i} 个和前面重了`).toBe(false);
      seen.add(key);
    }
    // 6 列：第 0 和第 5 个应该在同一行，第 6 个换行
    const a = selectGridRect(0, count);
    const b = selectGridRect(5, count);
    const c = selectGridRect(6, count);
    expect(b.y).toBe(a.y);
    expect(c.y).toBeGreaterThan(a.y);
  });

  it('整个网格在手台上沿之上（不手台压住格子）', () => {
    const count = 29;
    for (let i = 0; i < count; i++) {
      const r = selectGridRect(i, count);
      expect(r.y + r.h, `第 ${i} 个太低`).toBeLessThan(140);
      expect(r.x + r.w).toBeLessThanOrEqual(VIEW_WIDTH);
    }
  });

  it('点格子能命中对应角色（含间隙）', () => {
    const count = 29;
    for (let i = 0; i < count; i++) {
      const r = selectGridRect(i, count);
      expect(hitTestCell(r.x + 2, r.y + 2, count)).toBe(i);
    }
    // 网格外的位置不命中
    expect(hitTestCell(VIEW_WIDTH / 2, 200, count)).toBe(-1);
  });
});

describe('手台位置调整（分别拖动 + 保存按钮）', () => {
  it('「保存」和「用默认」两个按钮都在提示条里、互不重叠、不超出屏宽', () => {
    for (const b of [PAD_SAVE_BUTTON, PAD_RESET_BUTTON]) {
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h).toBeLessThanOrEqual(44); // 提示条高 44
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(VIEW_WIDTH);
    }
    expect(PAD_SAVE_BUTTON.x + PAD_SAVE_BUTTON.w).toBeLessThanOrEqual(PAD_RESET_BUTTON.x);
  });

  it('自定义位置按控件分别记录（摇杆和 A~D 各存各的）', () => {
    const custom = { stick: { x: 0.2, y: 0.8 }, A: { x: 0.8, y: 0.9 } };
    const l = padLayout(1280, 720, NO_PAD_INSETS, custom);
    // 摇杆移到左侧 20%、按键 A 移到右侧 80%——两者互不影响
    expect(l.stick.cx / 1280).toBeCloseTo(0.2, 1);
    expect(l.buttons.A.cx / 1280).toBeCloseTo(0.8, 1);
  });
});

describe('加载屏', () => {
  it('显示百分比，且数字跟着进度走', () => {
    for (const p of [0, 0.37, 1]) {
      const ctx = new FakeCtx();
      drawLoadingScreen(ctx, p, '正在加载角色图集');
      const pct = `${Math.round(p * 100)}%`;
      expect(ctx.texts.some((t) => t.text === pct), `进度 ${p} 应有 ${pct}`).toBe(true);
    }
  });

  it('进度超出 0~1 会夹住（不会画出条外的方块）', () => {
    const ctx = new FakeCtx();
    drawLoadingScreen(ctx, 1.8, 'x');
    expect(ctx.texts.some((t) => t.text === '100%')).toBe(true);
    const ctx2 = new FakeCtx();
    drawLoadingScreen(ctx2, -0.5, 'x');
    expect(ctx2.texts.some((t) => t.text === '0%')).toBe(true);
  });
});
