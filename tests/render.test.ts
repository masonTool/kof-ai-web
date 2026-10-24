import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Palette } from '../src/data/schema';
import { FighterState } from '../src/sim/state';
import {
  POSE_LIBRARY,
  STATE_ANIM,
  hasPose,
  poseNames,
  resolvePose,
  validateCharPoses,
  type PoseFrame,
} from '../src/render/poses';
import { drawFighter, drawPose, shade } from '../src/render/fighter-draw';
import { currentAssetProvider, hasCustomArt, setAssetProvider, spriteFor } from '../src/render/assets';
import { FxSystem } from '../src/render/fx';
import { CINEMA_BAR, drawFrame, drawProjectile, introAnimFor } from '../src/render/renderer';
import { getPixelSize, lighten } from '../src/render/fighter-draw';
import { Match } from '../src/game/match';
import { Projectile } from '../src/sim/projectile';
import { KYO } from '../src/data/chars/kyo';
import { IORI } from '../src/data/chars/iori';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../src/sim/constants';
import { FakeCtx } from './helpers/fake-ctx';

const PALETTE: Palette = {
  skin: '#e8b48a',
  hair: '#1a1a22',
  primary: '#20232b',
  secondary: '#3d3a35',
  trim: '#f2f0e6',
  accent: '#e23b3b',
};


function allJoints(frame: PoseFrame): number[] {
  const nums: number[] = [];
  const flat = (pt: readonly [number, number]): void => {
    nums.push(pt[0], pt[1]);
  };
  flat(frame.head);
  flat(frame.neck);
  flat(frame.hip);
  for (const pair of [frame.armBack, frame.armFront, frame.legBack, frame.legFront]) {
    flat(pair[0]);
    flat(pair[1]);
  }
  return nums;
}

describe('姿势库数据完整性', () => {
  it('每个姿势都有帧、帧时长合法、关键点都是有限数', () => {
    const names = poseNames();
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const pose = POSE_LIBRARY[name]!;
      expect(pose.frames.length, name).toBeGreaterThan(0);
      expect(pose.frameDuration, name).toBeGreaterThanOrEqual(1);
      for (const frame of pose.frames) {
        const nums = allJoints(frame);
        expect(nums.length).toBe(22); // 3 单点 + 4 组 [肘/手 或 膝/脚]
        expect(nums.every((n) => Number.isFinite(n)), name).toBe(true);
      }
    }
  });

  it('引擎需要的动画名一个都不能少', () => {
    const required = [
      'idle',
      'walkF',
      'walkB',
      'crouch',
      'jump',
      'landing',
      'guard',
      'block',
      'hit',
      'down',
      'wakeup',
      'dizzy',
      'punchLight',
      'punchHeavy',
      'kickLight',
      'kickHeavy',
      'crouchPunch',
      'crouchKick',
      'jumpAttack',
      'special',
      'throwStart',
    ];
    for (const name of required) expect(hasPose(name), name).toBe(true);
  });

  it('状态映射覆盖所有角色状态', () => {
    for (const state of Object.values(FighterState)) {
      const anim = STATE_ANIM[state];
      expect(anim, state).toBeTruthy();
      expect(hasPose(anim!), `${state} → ${anim}`).toBe(true);
    }
  });

  it('攻击类动画是定格（不循环），待机/走是循环', () => {
    expect(POSE_LIBRARY['idle']!.loop).toBe(true);
    expect(POSE_LIBRARY['walkF']!.loop).toBe(true);
    expect(POSE_LIBRARY['punchHeavy']!.loop).toBe(false);
    expect(POSE_LIBRARY['down']!.loop).toBe(false);
  });
});

describe('姿势解析', () => {
  it('循环动画一圈后回到起点，且帧间是连续过渡（不是硬切）', () => {
    const a = resolvePose('idle', 0);
    const lap = POSE_LIBRARY['idle']!.frameDuration * POSE_LIBRARY['idle']!.frames.length;
    expect(resolvePose('idle', lap)).toEqual(a);
    // 刚过 1 帧时应该是"接近第一帧"，而不是与某个关键帧完全相等
    const next = resolvePose('idle', 1);
    expect(next.head[0]).toBeCloseTo(a.head[0], 0);
    expect(next).not.toEqual(a);
  });

  it('定格动画停在最后一帧', () => {
    const last = POSE_LIBRARY['punchHeavy']!.frames.at(-1);
    expect(resolvePose('punchHeavy', 999)).toEqual(last);
  });

  it('未知动画回落到待机，不会崩', () => {
    expect(resolvePose('不存在的动作', 3)).toEqual(resolvePose('idle', 3));
  });

  it('出招时关键帧按招式总帧数铺满（不是一帧放完）', () => {
    const first = resolvePose('punchHeavy', 0, 24);
    const middle = resolvePose('punchHeavy', 12, 24);
    const last = resolvePose('punchHeavy', 23, 24);
    expect(first).toEqual(POSE_LIBRARY['punchHeavy']!.frames[0]);
    expect(middle).not.toEqual(first);
    expect(last).toEqual(POSE_LIBRARY['punchHeavy']!.frames.at(-1));
  });

  it('招式引用的 anim 必须在库里', () => {
    expect(validateCharPoses({ id: 'x', moves: { '5A': { anim: 'punchLight' } } })).toEqual([]);
    expect(validateCharPoses({ id: 'x', moves: { '5A': { anim: '根本没有' } } })).toHaveLength(1);
  });
});

describe('角色绘制', () => {
  it('朝右直接画、朝左镜像', () => {
    const right = new FakeCtx();
    drawFighter(right, { palette: PALETTE, facing: 1, x: 100, y: 200, anim: 'idle', elapsed: 0 });
    expect(right.transforms.translate).toEqual([[100, 200]]);
    expect(right.transforms.scale).toEqual([[1, 1]]);

    const left = new FakeCtx();
    drawFighter(left, { palette: PALETTE, facing: -1, x: 100, y: 200, anim: 'idle', elapsed: 0 });
    expect(left.transforms.scale).toEqual([[-1, 1]]);
  });

  it('save/restore 成对，不泄漏变换', () => {
    const ctx = new FakeCtx();
    drawFighter(ctx, { palette: PALETTE, facing: 1, x: 0, y: 0, anim: 'walkF', elapsed: 4 });
    expect(ctx.count('save')).toBe(ctx.count('restore'));
    expect(ctx.depth).toBe(0);
  });

  it('角色是由像素块拼出来的（方块数够多，不再是矢量线条）', () => {
    const px = getPixelSize();
    const ctx = new FakeCtx();
    drawPose(ctx, resolvePose('idle', 0), PALETTE);
    expect(ctx.rects.length).toBeGreaterThan(120);
    // 方块都对齐到当前粒度网格（负数取模会得到 -0，取绝对值再比）
    for (const r of ctx.rects.slice(0, 30)) {
      expect(Math.abs(r.x % px), `x=${r.x}`).toBe(0);
      expect(Math.abs(r.y % px), `y=${r.y}`).toBe(0);
    }
  });

  it('命中闪白：整体提亮但仍保留本色（不是糊成一个白影子）', () => {
    const ctx = new FakeCtx();
    drawPose(ctx, resolvePose('hit', 0), PALETTE, { flash: true });
    // 描边块永远是纯黑（那是轮廓，不该被提亮），排除掉再看角色本体色
    const solid = ctx.fills.filter((c) => c.startsWith('#') && c !== '#0c0a09');
    expect(solid.length).toBeGreaterThan(0);
    // 全部都被提亮：亮度接近白，但不是纯白
    for (const c of solid) {
      const v = Number.parseInt(c.slice(1, 3), 16);
      expect(v).toBeGreaterThan(200);
    }
    // 不是"全白一片"：绝大多数填充仍是带色调的（只有眼睛等少量点缀是纯白）
    expect(solid.filter((c) => c === '#ffffff').length).toBeLessThan(solid.length / 2);
    // 原色（不闪）不该出现
    expect(solid).not.toContain(PALETTE.primary);
  });

  it('lighten 把颜色往白里混，amount=0 原样返回', () => {
    expect(lighten('#000000', 0)).toBe('#000000');
    expect(lighten('#000000', 1)).toBe('#ffffff');
    expect(lighten('#000000', 0.5)).toBe('#808080');
  });

  it('库里每个动画都能画出来（不抛异常）', () => {
    for (const name of poseNames()) {
      const ctx = new FakeCtx();
      expect(() => drawFighter(ctx, { palette: PALETTE, facing: -1, x: 10, y: 200, anim: name, elapsed: 9 })).not.toThrow();
      expect(ctx.rects.length).toBeGreaterThan(50);
    }
  });

  it('透明度会被夹在 0~1', () => {
    const ctx = new FakeCtx();
    drawFighter(ctx, { palette: PALETTE, facing: 1, x: 0, y: 0, anim: 'idle', elapsed: 0, alpha: 5 });
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('颜色工具', () => {
  it('按系数调暗并夹取', () => {
    expect(shade('#ffffff', 0.5)).toBe('#808080');
    expect(shade('#000000', 2)).toBe('#000000');
    expect(shade('#f80', 1)).toBe('#ff8800');
  });

  it('非法颜色原样返回', () => {
    expect(shade('not-a-color', 0.5)).toBe('not-a-color');
  });
});

describe('素材层（将来换贴图的口子）', () => {
  it('默认没有素材，走程序化绘制', () => {
    expect(hasCustomArt()).toBe(false);
    expect(spriteFor('kyo', 'idle', 0)).toBeNull();
  });

  it('装上 provider 就能取到帧，卸载后回落', () => {
    setAssetProvider({
      fighter: (charId, anim, frame) =>
        charId === 'kyo' && anim === 'idle' ? { image: {} as CanvasImageSource, sx: frame * 32, sy: 0, sw: 32, sh: 64 } : null,
    });
    expect(hasCustomArt()).toBe(true);
    expect(spriteFor('kyo', 'idle', 2)?.sx).toBe(64);
    expect(spriteFor('kyo', 'walkF', 0)).toBeNull();
    expect(currentAssetProvider()).not.toBeNull();

    setAssetProvider(null);
    expect(hasCustomArt()).toBe(false);
  });
});

describe('命中特效', () => {
  it('命中/防御/落地各自生成粒子，重击与反击更多', () => {
    const fx = new FxSystem(new Rng(1));
    fx.spawnHit(10, 10);
    expect(fx.count).toBe(9);
    fx.clear();
    fx.spawnHit(10, 10, { heavy: true });
    expect(fx.count).toBe(14);
    fx.clear();
    fx.spawnHit(10, 10, { counter: true });
    expect(fx.count).toBe(13);
    fx.clear();
    fx.spawnGuard(10, 10);
    expect(fx.count).toBe(6); // 防御火花 6 颗（带属性时才多一颗本色）
    fx.clear();
    fx.spawnDust(10, 10);
    expect(fx.count).toBe(5);
  });

  it('粒子会老化消失', () => {
    const fx = new FxSystem(new Rng(2));
    fx.spawnHit(0, 0, { heavy: true });
    for (let i = 0; i < 25; i++) fx.update();
    expect(fx.count).toBe(0);
  });

  it('同种子同特效（回放一致）', () => {
    const a = new FxSystem(new Rng(42));
    const b = new FxSystem(new Rng(42));
    a.spawnHit(30, 60, { heavy: true });
    b.spawnHit(30, 60, { heavy: true });
    expect(a.particles).toEqual(b.particles);
  });

  it('粒子数有上限，不会无限涨', () => {
    const fx = new FxSystem(new Rng(3), 40);
    for (let i = 0; i < 20; i++) fx.spawnHit(0, 0, { heavy: true });
    expect(fx.count).toBeLessThanOrEqual(40);
  });

  it('可以在 ctx 上画出来', () => {
    const fx = new FxSystem(new Rng(4));
    const ctx = new FakeCtx();
    fx.spawnHit(5, 5);
    fx.spawnGuard(6, 6);
    expect(() => fx.draw(ctx)).not.toThrow();
    expect(ctx.count('fillRect')).toBe(15); // 9 颗命中火花 + 6 颗防御火花
  });
});

describe('登场与收场姿势', () => {
  const makeMatch = (): Match => new Match(KYO, IORI, { introFrames: 10, roundEndFrames: 2 }, 5);

  it('开场演出期间摆挑衅姿势，开打后不覆盖', () => {
    const m = makeMatch();
    expect(introAnimFor(m)).toBe('taunt');
    m.phase = 'fight';
    expect(introAnimFor(m)).toBeNull();
  });

  it('挑衅姿势在姿势库里，且是循环的', () => {
    expect(hasPose('taunt')).toBe(true);
    expect(POSE_LIBRARY['taunt']!.loop).toBe(true);
    expect(POSE_LIBRARY['taunt']!.frames.length).toBeGreaterThan(0);
  });
});

describe('飞行道具形状', () => {
  const shapeOf = (shape: 'orb' | 'wave' | 'flame' | 'blade'): FakeCtx => {
    const ctx = new FakeCtx();
    const match = new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 1 }, 3);
    const owner = match.p1;
    const p = new Projectile(owner, {
      x: 100,
      y: 150,
      vx: 2,
      facing: 1,
      hit: KYO.moves['236A']!.hits[0]!,
      anim: 'x',
      life: 30,
      style: 'fire',
      shape,
    });
    drawProjectile(ctx, p);
    return ctx;
  };

  it('气弹（orb）用圆画：尾巴 + 外圈 + 内芯三个圆', () => {
    const ctx = shapeOf('orb');
    // 4 个拖尾圆 + 尾巴/外圈/内芯
    expect(ctx.arcs.length).toBe(7);
    // 地面辉光用椭圆
    expect(ctx.ellipses.length).toBe(1);
  });

  it('所有道具都有拖尾：尾部圆比头部小（速度感靠它）', () => {
    const ctx = shapeOf('orb');
    const tail = ctx.arcs.slice(0, 4);
    const body = ctx.arcs[5]!;
    expect(tail[0]!.r).toBeGreaterThan(tail[3]!.r); // 越远越小
    expect(body.r).toBeGreaterThan(tail[3]!.r);
  });

  it('音速波（wave）用横向椭圆画', () => {
    const ctx = shapeOf('wave');
    expect(ctx.ellipses.length).toBeGreaterThanOrEqual(4);
    expect(ctx.arcs.length).toBe(4); // 只有拖尾是圆
    // 横向比纵向宽（波是横着的）
    expect(ctx.ellipses[0]!.rx).toBeGreaterThan(ctx.ellipses[0]!.ry);
  });

  it('火柱（flame）叠三个圆，越往上越小', () => {
    const ctx = shapeOf('flame');
    expect(ctx.arcs.length).toBe(8); // 4 拖尾 + 3 层火焰 + 1 个内芯
    const body = ctx.arcs.slice(4, 7);
    expect(body[1]!.r).toBeGreaterThan(body[2]!.r);
  });

  it('风刃（blade）用弧线描边画（月牙），不是填充圆', () => {
    const ctx = shapeOf('blade');
    // 4 拖尾圆 + 外弧 + 内弧（只有两条是描边）
    expect(ctx.arcs.length).toBe(6);
    expect(ctx.calls.filter((c) => c === 'stroke').length).toBe(2);
    expect(ctx.ellipses.length).toBe(1);
  });

  it('形状之间画法确实不同（不是同一个圆换了颜色）', () => {
    const sigs = (['orb', 'wave', 'flame', 'blade'] as const).map((s) => {
      const ctx = shapeOf(s);
      return `${ctx.arcs.length}/${ctx.ellipses.length}`;
    });
    expect(new Set(sigs).size).toBe(4);
  });
});

describe('超必杀闪光', () => {
  const makeMatch = (): Match => new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 2 }, 9);

  const whiteRects = (ctx: FakeCtx): number =>
    ctx.rects.filter((r) => r.fill.startsWith('rgba(255,255,255')).length;

  it('没有闪光时不画那一层', () => {
    const m = makeMatch();
    const ctx = new FakeCtx();
    drawFrame(ctx, m);
    expect(whiteRects(ctx)).toBe(0);
  });

  it('闪光期间盖一层白，且越接近结束越淡', () => {
    const m = makeMatch();
    const strong = new FakeCtx();
    m.superFlash = 12;
    drawFrame(strong, m);
    expect(whiteRects(strong)).toBe(1);

    const weak = new FakeCtx();
    m.superFlash = 2;
    drawFrame(weak, m);
    const alpha = (ctx: FakeCtx): number => {
      const fill = ctx.rects.find((r) => r.fill.startsWith('rgba(255,255,255'))!.fill;
      return Number.parseFloat(/([\d.]+)\)$/.exec(fill)![1]!);
    };
    expect(alpha(strong)).toBeGreaterThan(alpha(weak));
  });
});

describe('超必杀运镜（上下黑边）', () => {
  const makeMatch = (): Match => new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 2 }, 13);

  it('闪光期间画上下两条黑边', () => {
    const m = makeMatch();
    const before = new FakeCtx();
    drawFrame(before, m);
    const blackBefore = before.rects.filter((r) => r.fill === '#000000').length;

    m.superFlash = 8;
    const during = new FakeCtx();
    drawFrame(during, m);
    const blackDuring = during.rects.filter((r) => r.fill === '#000000').length;
    expect(blackDuring - blackBefore).toBe(2);
  });

  it('黑边高度是常量，且不遮挡中间画面', () => {
    const m = makeMatch();
    m.superFlash = 8;
    const ctx = new FakeCtx();
    drawFrame(ctx, m);
    const bars = ctx.rects.filter((r) => r.fill === '#000000' && r.w === VIEW_WIDTH);
    const heights = bars.map((r) => r.h);
    expect(heights).toContain(CINEMA_BAR);
    expect(CINEMA_BAR * 2).toBeLessThan(VIEW_HEIGHT / 2);
  });
});

describe('姿势插值（去木偶感的核心）', () => {
  it('两个关键帧之间是连续过渡，不是硬切', () => {
    const a = POSE_LIBRARY['punchHeavy']!.frames[0]!;
    const b = POSE_LIBRARY['punchHeavy']!.frames[1]!;
    const mid = resolvePose('punchHeavy', 4, 24); // 3 帧里第 0→1 之间
    expect(mid).not.toEqual(a);
    expect(mid).not.toEqual(b);
    // 手的位置落在两帧之间
    const lo = Math.min(a.armFront[1][0], b.armFront[1][0]);
    const hi = Math.max(a.armFront[1][0], b.armFront[1][0]);
    expect(mid.armFront[1][0]).toBeGreaterThanOrEqual(lo - 0.01);
    expect(mid.armFront[1][0]).toBeLessThanOrEqual(hi + 0.01);
  });

  it('起始帧精确等于关键帧、末帧停在最后一帧', () => {
    expect(resolvePose('punchHeavy', 0, 24)).toEqual(POSE_LIBRARY['punchHeavy']!.frames[0]!);
    expect(resolvePose('punchHeavy', 999, 24)).toEqual(POSE_LIBRARY['punchHeavy']!.frames.at(-1)!);
  });

  it('出招用 ease-out：前半段走得更远（快出慢停）', () => {
    const start = POSE_LIBRARY['punchHeavy']!.frames[0]!.armFront[1][0];
    const end = POSE_LIBRARY['punchHeavy']!.frames[1]!.armFront[1][0];
    const q1 = resolvePose('punchHeavy', 2, 24).armFront[1][0]; // 1/4 处
    const q3 = resolvePose('punchHeavy', 6, 24).armFront[1][0]; // 3/4 处
    expect(q1 - start).toBeGreaterThan((q3 - start) / 3);
    expect(end).toBeGreaterThan(start);
  });

  it('循环动画用 inOut：中点仍在两帧之间', () => {
    const idle = POSE_LIBRARY['idle']!;
    const mid = resolvePose('idle', idle.frameDuration / 2);
    expect(mid).not.toEqual(idle.frames[0]!);
    expect(mid).not.toEqual(idle.frames[1]!);
  });

  it('受击姿势有三帧（被打弯 → 后仰 → 回一半）', () => {
    expect(POSE_LIBRARY['hit']!.frames.length).toBe(3);
    // 第二帧头被打得最偏
    const heads = POSE_LIBRARY['hit']!.frames.map((fr) => fr.head[0]);
    expect(Math.min(...heads)).toBe(heads[1]);
  });

  it('防御姿势是循环的（会有呼吸/被顶住的微动，不是一张静止图）', () => {
    expect(POSE_LIBRARY['guard']!.loop).toBe(true);
    const g = POSE_LIBRARY['guard']!;
    expect(resolvePose('guard', 0)).not.toEqual(resolvePose('guard', g.frameDuration / 2));
  });
});

describe('挥击拖尾', () => {
  const drawWith = (anim: string): FakeCtx => {
    const ctx = new FakeCtx();
    drawPose(ctx, POSE_LIBRARY['punchHeavy']!.frames[1]!, PALETTE, { anim });
    return ctx;
  };

  it('攻击动画会多画几条拖尾线', () => {
    const attack = drawWith('punchHeavy');
    const idle = drawWith('idle');
    expect(attack.calls.filter((c) => c === 'stroke').length).toBeGreaterThan(
      idle.calls.filter((c) => c === 'stroke').length,
    );
  });

  it('拖尾是半透明的（叠在角色身上不会糊成一团白）', () => {
    const ctx = new FakeCtx();
    drawPose(ctx, POSE_LIBRARY['punchHeavy']!.frames[1]!, PALETTE, { anim: 'punchHeavy' });
    expect(ctx.globalAlpha).toBe(1); // 画完要还原
  });
});

describe('身体体积与重量感', () => {
  const frame = POSE_LIBRARY['idle']!.frames[0]!;
  const draw = (opts: Parameters<typeof drawPose>[3] = {}): FakeCtx => {
    const ctx = new FakeCtx();
    drawPose(ctx, frame, PALETTE, opts);
    return ctx;
  };

  it('躯干是梯形（肩比腰宽），不是一根粗线', () => {
    const ctx = draw();
    // 躯干按行填充：每行一条方块带，最宽的那行就是肩宽
    const bodyRows = ctx.rects.filter((r) => r.fill === PALETTE.primary && r.w > 4);
    expect(bodyRows.length).toBeGreaterThan(4);
    const widths = [...new Set(bodyRows.map((r) => r.w))].sort((a, b) => b - a);
    expect(widths[0]!).toBeGreaterThan(widths[widths.length - 1]! + 2);
  });

  it('影子是两层椭圆（外淡内实），不是菱形', () => {
    const ctx = draw();
    expect(ctx.ellipses.length).toBeGreaterThanOrEqual(2);
    expect(ctx.ellipses[0]!.rx).toBeGreaterThan(ctx.ellipses[0]!.ry);
  });

  it('挤压拉伸会改变整体缩放（纵向拉长 / 横向压扁）', () => {
    const stretched = draw({ squash: 0.7 });
    const flat = draw({ squash: -0.8 });
    const lastScale = (ctx: FakeCtx): [number, number] =>
      ctx.transforms.scale[ctx.transforms.scale.length - 1] ?? [1, 1];
    expect(lastScale(stretched)[1]).toBeGreaterThan(1); // 纵向更长
    expect(lastScale(stretched)[0]).toBeLessThan(1); // 横向更窄
    expect(lastScale(flat)[1]).toBeLessThan(1);
    expect(lastScale(flat)[0]).toBeGreaterThan(1);
  });

  it('挤压拉伸也是以脚底为原点（save/restore 成对）', () => {
    const ctx = draw({ squash: 0.6 });
    expect(ctx.calls.filter((c) => c === 'save').length).toBe(
      ctx.calls.filter((c) => c === 'restore').length,
    );
  });

  it('惯性会让姿势比"不拖"更靠近上一帧', () => {
    const dur = 24;
    const now = resolvePose('punchHeavy', 12, dur);
    const lagged = resolvePose('punchHeavy', 12, dur, 'out', 0.4);
    const earlier = resolvePose('punchHeavy', 10, dur);
    const dist = (a: typeof now, b: typeof now): number => Math.hypot(a.head[0] - b.head[0], a.head[1] - b.head[1]);
    expect(lagged).not.toEqual(now);
    expect(dist(lagged, earlier)).toBeLessThan(dist(now, earlier));
  });

  it('lag = 0 时与不传完全一致（默认不开惯性）', () => {
    expect(resolvePose('punchHeavy', 8, 24)).toEqual(resolvePose('punchHeavy', 8, 24, 'out', 0));
  });

  it('头部是由方块拼的（像素圆 + 下巴 + 耳朵），占够面积', () => {
    const ctx = draw();
    // 头部区域（脚底原点，头在 y≈-78..-56）里的皮肤色方块
    const headBlocks = ctx.rects.filter(
      (r) => r.fill === PALETTE.skin && r.y <= -56 && r.y >= -82 && Math.abs(r.x) < 16,
    );
    expect(headBlocks.length).toBeGreaterThan(5);
    // 而且确实铺满了头的宽度（不是一个小点）
    const width = Math.max(...headBlocks.map((r) => r.w));
    expect(width).toBeGreaterThan(8);
  });
});

describe('细节层（五官/鞋/衣褶/暗部）', () => {
  const frame = POSE_LIBRARY['idle']!.frames[0]!;
  const draw = (): FakeCtx => {
    const ctx = new FakeCtx();
    drawPose(ctx, frame, PALETTE, {});
    return ctx;
  };

  it('脸上有眼白与瞳孔（不是一块纯皮肤色）', () => {
    const ctx = draw();
    const eyeWhites = ctx.rects.filter((r) => r.fill === '#f6efe4' && Math.abs(r.x) < 18 && r.y < -55);
    expect(eyeWhites.length).toBeGreaterThan(0);
  });

  it('脚上有鞋面（亮色出现在脚部高度）', () => {
    const ctx = draw();
    const shoes = ctx.rects.filter((r) => (r.fill === PALETTE.primary || r.fill === PALETTE.trim) && r.y > -8);
    expect(shoes.length).toBeGreaterThan(0);
  });

  it('肢体有暗部（同一部位不止一个色阶，才有体积）', () => {
    const ctx = draw();
    const colors = new Set(ctx.rects.map((r) => r.fill));
    // 皮肤 + 皮肤暗部 + 外套 + 外套暗部 + 副色 + 副色暗部 + 头发 + 腰带 + 眼白 + 描边
    expect(colors.size).toBeGreaterThanOrEqual(8);
  });

  it('闪白时细节也跟着提亮（不会在白影子上浮出深色碎块）', () => {
    const ctx = new FakeCtx();
    drawPose(ctx, frame, PALETTE, { flash: true });
    const dark = ctx.rects.filter((r) => r.fill !== '#0c0a09' && r.fill !== '#ffffff');
    for (const r of dark) {
      const v = Number.parseInt(r.fill.slice(1, 3), 16);
      expect(v).toBeGreaterThan(150);
    }
  });
});
