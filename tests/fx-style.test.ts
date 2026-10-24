import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { ROSTER } from '../src/data/chars';
import { BENIMARU } from '../src/data/chars/benimaru';
import { IORI } from '../src/data/chars/iori';
import { KYO } from '../src/data/chars/kyo';
import { CHAR_FX_STYLE, styleOfMove } from '../src/data/fx-style';
import type { FxStyle, MoveDef } from '../src/data/schema';
import { FxSystem, STYLE_COLORS, guardColorsFor } from '../src/render/fx';
import { FakeCtx } from './helpers/fake-ctx';

const fakeMove = (over: Partial<MoveDef>): MoveDef => ({
  id: 'X',
  name: '测试招式',
  anim: 'punchHeavy',
  total: 30,
  hits: [],
  kind: 'special',
  ...over,
});

describe('角色气质表', () => {
  it('表里的 id 都是真角色（拼错会静默失效）', () => {
    const ids = new Set(ROSTER.map((c) => c.id));
    for (const id of Object.keys(CHAR_FX_STYLE)) expect(ids.has(id), id).toBe(true);
  });

  it('每个值都是合法风格', () => {
    const allowed: FxStyle[] = ['none', 'fire', 'darkfire', 'thunder', 'wind', 'ki'];
    for (const [id, style] of Object.entries(CHAR_FX_STYLE)) expect(allowed, id).toContain(style);
  });

  it('主角团的气质符合预期', () => {
    expect(CHAR_FX_STYLE['kyo']).toBe('fire');
    expect(CHAR_FX_STYLE['iori']).toBe('darkfire');
    expect(CHAR_FX_STYLE['benimaru']).toBe('thunder');
  });
});

describe('招式 → 特效风格', () => {
  it('通常技不带属性（满屏彩色反而看不出谁是谁）', () => {
    expect(styleOfMove('kyo', KYO.moves['5C']!)).toBe('none');
    expect(styleOfMove('benimaru', BENIMARU.moves['2D']!)).toBe('none');
  });

  it('必杀/超必杀用角色默认气质', () => {
    expect(styleOfMove('kyo', KYO.moves['236C']!)).toBe('fire');
    expect(styleOfMove('iori', IORI.moves['236A']!)).toBe('darkfire');
    expect(styleOfMove('benimaru', BENIMARU.moves['236A']!)).toBe('thunder');
  });

  it('招式显式写了 fx 就听招式的（哪怕它是通常技）', () => {
    expect(styleOfMove('kyo', fakeMove({ kind: 'normal', fx: 'ki' }))).toBe('ki');
  });

  it('表里没写的角色当作无属性', () => {
    expect(styleOfMove('根本没这个角色', fakeMove({ kind: 'special' }))).toBe('none');
  });

  it('投技/系统技/指令技都不带属性', () => {
    for (const kind of ['throw', 'system', 'command', 'normal'] as const) {
      expect(styleOfMove('kyo', fakeMove({ kind })), kind).toBe('none');
    }
  });

  it('没有招式时返回 none（不崩）', () => {
    expect(styleOfMove('kyo', null)).toBe('none');
  });
});

describe('特效配色', () => {
  it('每种属性都有四档颜色', () => {
    for (const [style, colors] of Object.entries(STYLE_COLORS)) {
      expect(colors.length, style).toBe(4);
      expect(new Set(colors).size, style).toBeGreaterThan(1);
    }
    expect(STYLE_COLORS.fire).not.toEqual(STYLE_COLORS.thunder);
    expect(STYLE_COLORS.darkfire[1]).not.toBe(STYLE_COLORS.fire[1]);
  });

  it('火是暖色、雷是冷色（肉眼能分辨）', () => {
    expect(STYLE_COLORS.fire[1]).toMatch(/^#ff/i);
    expect(STYLE_COLORS.thunder[2]).toMatch(/^#7f/i);
  });

  it('命中的粒子颜色来自该属性配色', () => {
    const fx = new FxSystem(new Rng(7));
    fx.spawnHit(100, 100, { style: 'fire' });
    const colors = new Set(fx.particles.map((p) => p.color));
    for (const c of colors) expect(STYLE_COLORS.fire).toContain(c);
  });

  it('雷属性比无属性粒子更多、更快（打击感更强）', () => {
    const plain = new FxSystem(new Rng(3));
    plain.spawnHit(0, 0, {});
    const bolt = new FxSystem(new Rng(3));
    bolt.spawnHit(0, 0, { style: 'thunder' });
    expect(bolt.count).toBeGreaterThan(plain.count);
    const avgSpeed = (f: FxSystem): number =>
      f.particles.reduce((s, p) => s + Math.hypot(p.vx, p.vy), 0) / Math.max(1, f.count);
    expect(avgSpeed(bolt)).toBeGreaterThan(avgSpeed(plain));
  });

  it('带属性的防御火花仍以蓝白为主，但必有一颗本色火星', () => {
    expect(guardColorsFor('none')).not.toContain(STYLE_COLORS.fire[1]);
    expect(guardColorsFor('fire')).toContain(STYLE_COLORS.fire[1]);

    const fx = new FxSystem(new Rng(11));
    fx.spawnGuard(0, 0, 'fire');
    const colors = fx.particles.map((p) => p.color);
    expect(colors).toContain(STYLE_COLORS.fire[1]!);
    // 蓝白打底：多数粒子仍是防御色
    const blue = colors.filter((c) => c === '#bfe3ff' || c === '#7fb8ff' || c === '#ffffff');
    expect(blue.length).toBeGreaterThanOrEqual(4);
  });

  it('同一颗种子、同一属性 → 特效完全一致（回放不会花屏）', () => {
    const a = new FxSystem(new Rng(99));
    const b = new FxSystem(new Rng(99));
    a.spawnHit(50, 60, { style: 'ki', heavy: true });
    b.spawnHit(50, 60, { style: 'ki', heavy: true });
    const sig = (f: FxSystem): string[] => f.particles.map((p) => `${p.x.toFixed(2)},${p.color}`);
    expect(sig(a)).toEqual(sig(b));
  });

  it('带属性的粒子多画一圈外发光（否则火和雷都是白点点）', () => {
    const styled = new FxSystem(new Rng(2));
    styled.spawnHit(0, 0, { style: 'fire' });
    const plain = new FxSystem(new Rng(2));
    plain.spawnHit(0, 0, {});
    const count = styled.count;
    expect(count).toBeGreaterThan(0);

    const draw = (fx: FxSystem): FakeCtx => {
      const ctx = new FakeCtx();
      fx.draw(ctx);
      return ctx;
    };
    // 每颗粒子：带属性画 2 次（光晕 + 核心），无属性画 1 次
    expect(draw(plain).rects.length).toBe(plain.count);
    expect(draw(styled).rects.length).toBe(count * 2);
    // 光晕用的是该属性的深色档
    // 光晕用的是该属性的深色档；核心色里也可能出现同一个色，所以只断言"不少于"
    const halos = draw(styled).fills.filter((f) => f === STYLE_COLORS.fire[2]);
    expect(halos.length).toBeGreaterThanOrEqual(count);
  });

  it('粒子能画到 ctx 上（不依赖具体实现）', () => {
    const fx = new FxSystem(new Rng(5));
    fx.spawnHit(10, 10, { style: 'wind' });
    const ctx = new FakeCtx();
    expect(() => fx.draw(ctx)).not.toThrow();
    expect(ctx.rects.length).toBeGreaterThan(0);
  });
});

describe('气弹类角色', () => {
  it('道具的风格与角色气质一致', () => {
    expect(CHAR_FX_STYLE['athena']).toBe('ki');
    expect(CHAR_FX_STYLE['chris']).toBe('fire');
    expect(CHAR_FX_STYLE['leona']).toBe('wind');
  });

  it('必杀技解析出的风格与表一致', () => {
    expect(styleOfMove('chris', { ...fakeMove({ kind: 'special' }) })).toBe('fire');
    expect(styleOfMove('leona', { ...fakeMove({ kind: 'super' }) })).toBe('wind');
  });
});

describe('冲击帧（命中当帧的爆闪）', () => {
  const make = (): FxSystem => new FxSystem(new Rng(7));

  it('打中会生成冲击帧，重击比轻击活得久', () => {
    const fx = make();
    fx.spawnImpact(100, 120, { heavy: false });
    fx.spawnImpact(100, 120, { heavy: true });
    expect(fx.impacts).toHaveLength(2);
    expect(fx.impacts[0]!.maxLife).toBeLessThan(fx.impacts[1]!.maxLife);
  });

  it('反击/属性都会带到冲击帧上（配色和大小跟着变）', () => {
    const fx = make();
    fx.spawnImpact(0, 0, { counter: true, style: 'fire', dir: -1 });
    const im = fx.impacts[0]!;
    expect(im.counter).toBe(true);
    expect(im.style).toBe('fire');
    expect(im.dir).toBe(-1);
  });

  it('到寿命就自己消失，clear() 也清得掉', () => {
    const fx = make();
    fx.spawnImpact(10, 10, { heavy: false });
    for (let i = 0; i < 10; i++) fx.update();
    expect(fx.impacts).toHaveLength(0);

    fx.spawnImpact(10, 10, {});
    fx.clear();
    expect(fx.impacts).toHaveLength(0);
  });

  it('画出来是"圆环 + 尖刺 + 白团"，不是只有粒子', () => {
    const fx = make();
    fx.spawnImpact(50, 60, { heavy: true, style: 'thunder' });
    // 推进两帧：第一帧只有白团，尖刺是"长出来"的
    fx.update();
    fx.update();
    const ctx = new FakeCtx();
    fx.draw(ctx);
    expect(ctx.calls.filter((c) => c === 'arc').length).toBeGreaterThanOrEqual(2); // 圆环 + 白团
    expect(ctx.calls.filter((c) => c === 'fill').length).toBeGreaterThanOrEqual(6); // 白团 + 内芯 + 四根尖刺
    expect(ctx.globalAlpha).toBe(1); // 画完必须还原，否则后面整屏半透明
  });

  it('不含随机数：同样的输入两次生成完全一样（回放不会漂）', () => {
    const a = make();
    const b = make();
    a.spawnImpact(1, 2, { heavy: true, counter: true, style: 'ki', dir: 1 });
    b.spawnImpact(1, 2, { heavy: true, counter: true, style: 'ki', dir: 1 });
    expect(a.impacts[0]).toEqual(b.impacts[0]);
  });
});
