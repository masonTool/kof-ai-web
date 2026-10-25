import { describe, expect, it } from 'vitest';
import { KYO } from '../src/data/chars/kyo';
import { IORI } from '../src/data/chars/iori';
import { poseForMove, poseForMotion } from '../src/render/move-anim';
import { poseNames } from '../src/render/poses';

const poses = new Set(poseNames());

describe('必杀技专属动作', () => {
  it('同一角色的四种必杀不再共用一个姿势（这是"没有专属动作"的根源）', () => {
    const qcf = poseForMove(KYO.moves['236A']!);
    const dp = poseForMove(KYO.moves['623P']!);
    const superMove = poseForMove(KYO.moves['236236AC']!);
    expect(qcf).not.toBe(dp);
    expect(dp).not.toBe(superMove);
  });

  it('波动用推手、升龙用重脚、超必杀用 special', () => {
    expect(poseForMotion('236')).toBe('punchHeavy');
    expect(poseForMotion('623')).toBe('kickHeavy');
    expect(poseForMove(KYO.moves['236236AC']!)).toBe('special');
  });

  it('映射出来的姿势必须真的存在（否则有贴图的角色会回落到程序化绘制）', () => {
    for (const m of ['236', '214', '623', '421', '6', '41236', '63214', 'doubleTapF', 'chargeBack']) {
      const pose = poseForMotion(m);
      if (pose) expect(poses.has(pose), `${m} → ${pose}`).toBe(true);
    }
  });

  it('普通技的原姿势不受影响（数据里写了什么就用什么）', () => {
    expect(poseForMove(KYO.moves['5A']!)).toBe(KYO.moves['5A']!.anim);
    expect(poseForMove(KYO.moves['5A']!)).not.toBe('special');
  });

  it('以后真有专属动作时不会被覆盖（显式 anim 优先）', () => {
    const custom = { ...KYO.moves['236A']!, anim: 'punchLight' };
    expect(poseForMove(custom)).toBe('punchLight');
  });

  it('每个角色的必杀都能拿到存在的姿势', () => {
    for (const char of [KYO, IORI]) {
      for (const move of Object.values(char.moves)) {
        if (move.kind !== 'special' && move.kind !== 'super') continue;
        expect(poses.has(poseForMove(move)), `${char.id}/${move.id}`).toBe(true);
      }
    }
  });
});
