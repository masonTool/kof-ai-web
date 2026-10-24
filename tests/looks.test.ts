import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/chars';
import { PALETTES } from '../src/data/chars/palette';
import { DEFAULT_LOOK, LOOKS, lookFor } from '../src/render/looks';
import { drawFighter, drawPose } from '../src/render/fighter-draw';
import { POSE_LIBRARY } from '../src/render/poses';
import { FakeCtx } from './helpers/fake-ctx';

const palette = PALETTES['kyo']!;
const idle = POSE_LIBRARY['idle']!.frames[0]!;

function draw(opts: { look?: ReturnType<typeof lookFor>; flash?: boolean } = {}): FakeCtx {
  const ctx = new FakeCtx();
  drawPose(ctx, idle, palette, opts);
  return ctx;
}

const count = (ctx: FakeCtx, name: string): number => ctx.calls.filter((c) => c === name).length;

describe('外观表', () => {
  it('没配置的角色走默认外观', () => {
    expect(lookFor('根本不存在的角色')).toEqual(DEFAULT_LOOK);
  });

  it('配置会与默认合并（只写差异项）', () => {
    const look = lookFor('kyo');
    expect(look.hair).toBe('spiky');
    expect(look.height).toBe(DEFAULT_LOOK.height);
    expect(look.build).toBe(DEFAULT_LOOK.build);
  });

  it('所有在册角色都有合法外观（数值在范围内）', () => {
    for (const char of ROSTER) {
      const look = lookFor(char.id);
      expect(look.height, char.id).toBeGreaterThanOrEqual(0.75);
      expect(look.height, char.id).toBeLessThanOrEqual(1.2);
      expect(look.build, char.id).toBeGreaterThanOrEqual(0.75);
      expect(look.build, char.id).toBeLessThanOrEqual(1.5);
      expect(look.head, char.id).toBeGreaterThanOrEqual(0.85);
      expect(['short', 'spiky', 'long', 'bald', 'ponytail']).toContain(look.hair);
      expect(['none', 'headband', 'hat', 'mask', 'glasses']).toContain(look.accessory);
    }
  });

  it('外观表里没有多余的角色（拼错 id 会留下孤儿配置）', () => {
    const ids = new Set(ROSTER.map((c) => c.id));
    for (const id of Object.keys(LOOKS)) expect(ids.has(id), id).toBe(true);
  });

  it('极端数值会被夹住', () => {
    expect(lookFor('chang').build).toBeLessThanOrEqual(1.5);
    expect(lookFor('choi').height).toBeGreaterThanOrEqual(0.75);
  });
});

describe('外观影响绘制', () => {
  it('壮实的人肢体更粗', () => {
    const slim = Math.max(...draw({ look: { ...DEFAULT_LOOK, build: 0.8 } }).lineWidths);
    const heavy = Math.max(...draw({ look: { ...DEFAULT_LOOK, build: 1.4 } }).lineWidths);
    expect(heavy).toBeGreaterThan(slim);
  });

  it('秃头不画后脑那块头发（少一个圆）', () => {
    const withHair = count(draw({ look: { ...DEFAULT_LOOK, hair: 'short' } }), 'arc');
    const bald = count(draw({ look: { ...DEFAULT_LOOK, hair: 'bald' } }), 'arc');
    expect(bald).toBe(withHair - 1);
  });

  it('刺猬头比短发多画几笔填充（发尖）', () => {
    const short = count(draw({ look: { ...DEFAULT_LOOK, hair: 'short' } }), 'fill');
    const spiky = count(draw({ look: { ...DEFAULT_LOOK, hair: 'spiky' } }), 'fill');
    expect(spiky).toBeGreaterThan(short);
  });

  it('长发与马尾各有额外形状', () => {
    for (const hair of ['long', 'ponytail'] as const) {
      const fills = count(draw({ look: { ...DEFAULT_LOOK, hair } }), 'fill');
      const short = count(draw({ look: { ...DEFAULT_LOOK, hair: 'short' } }), 'fill');
      expect(fills, hair).toBeGreaterThan(short);
    }
  });

  it('配件会多画东西：头带/帽子/面罩/墨镜都不一样', () => {
    const none = draw({ look: DEFAULT_LOOK });
    for (const accessory of ['headband', 'hat', 'mask', 'glasses'] as const) {
      const ctx = draw({ look: { ...DEFAULT_LOOK, accessory } });
      expect(ctx.calls.length, accessory).toBeGreaterThan(none.calls.length);
    }
  });

  it('身高不是 1 时会额外套一层纵向缩放（save/restore 仍然成对）', () => {
    const tall = new FakeCtx();
    drawFighter(tall, { palette, facing: 1, x: 0, y: 0, anim: 'idle', elapsed: 0, look: lookFor('daimon') });
    const scales = tall.transforms.scale;
    expect(scales.length).toBeGreaterThanOrEqual(1);
    // 外层是朝向/整体缩放，内层是身高的纵向缩放
    expect(scales[scales.length - 1]![1]).toBeGreaterThan(1);
    expect(count(tall, 'save')).toBe(count(tall, 'restore'));
  });

  it('身高为 1 的角色不会多套一层', () => {
    const flat = new FakeCtx();
    drawFighter(flat, { palette, facing: 1, x: 0, y: 0, anim: 'idle', elapsed: 0, look: { ...DEFAULT_LOOK } });
    const nested = new FakeCtx();
    drawPose(nested, idle, palette, { look: DEFAULT_LOOK });
    expect(flat.transforms.scale).toHaveLength(1); // 只有 drawFighter 那一层
  });

  it('闪白时头发/配件也变白（不会在白色人形上留深色块）', () => {
    const ctx = draw({ look: { ...DEFAULT_LOOK, accessory: 'mask' }, flash: true });
    const dark = ctx.fills.filter((f) => f === '#0c0a09');
    expect(dark).toHaveLength(0);
  });
});
