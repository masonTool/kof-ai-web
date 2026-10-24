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
  it('循环动画按 frameDuration 取模', () => {
    const a = resolvePose('idle', 0);
    const b = resolvePose('idle', POSE_LIBRARY['idle']!.frameDuration * POSE_LIBRARY['idle']!.frames.length);
    expect(a).toEqual(b);
    expect(resolvePose('idle', 1)).toEqual(a);
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

  it('会把四肢与躯干描出来（笔画数与填充数都够）', () => {
    const ctx = new FakeCtx();
    drawPose(ctx, resolvePose('idle', 0), PALETTE);
    // 4 肢 × 2 笔（描边+填色）= 8，加躯干 2 笔
    expect(ctx.count('stroke')).toBeGreaterThanOrEqual(10);
    expect(ctx.count('fill')).toBeGreaterThanOrEqual(3);
  });

  it('命中闪白时用白色填充', () => {
    const ctx = new FakeCtx();
    drawPose(ctx, resolvePose('hit', 0), PALETTE, { flash: true });
    expect(ctx.fills.every((c) => c === '#ffffff' || c.startsWith('rgba(0,0,0'))).toBe(true);
    expect(ctx.fills).toContain('#ffffff');
  });

  it('库里每个动画都能画出来（不抛异常）', () => {
    for (const name of poseNames()) {
      const ctx = new FakeCtx();
      expect(() => drawFighter(ctx, { palette: PALETTE, facing: -1, x: 10, y: 200, anim: name, elapsed: 9 })).not.toThrow();
      expect(ctx.count('stroke')).toBeGreaterThan(0);
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
