import { describe, expect, it } from 'vitest';
import { Btn } from '../src/core/input';
import { comboSets, comboDemoFor, flattenSteps, stepAt, totalDamage } from '../src/ui/combo-demo';
import { KYO } from '../src/data/chars/kyo';

describe('连招演示脚本', () => {
  it('三段由浅入深，最后一段用得上超必杀（两个攻击键同帧）', () => {
    const steps = comboDemoFor();
    expect(steps).toHaveLength(3);
    expect(steps[0]!.label).toContain('轻拳');
    const last = steps[2]!.frames;
    // 超必杀那一步：有一帧同时按住拳 + 另一个攻击键
    expect(last.some((f) => (f & Btn.A) !== 0 && (f & Btn.C) !== 0)).toBe(true);
  });

  it('每一段都真的按下过攻击键（否则演示等于空挥）', () => {
    for (const s of comboDemoFor()) {
      expect(s.frames.some((f) => (f & (Btn.A | Btn.B | Btn.C | Btn.D)) !== 0), s.label).toBe(true);
    }
  });

  it('必杀那段包含完整 236 方向（下 → 下右 → 右）', () => {
    const qcfStep = comboDemoFor()[1]!.frames;
    expect(qcfStep).toContain(Btn.Down);
    expect(qcfStep).toContain(Btn.Down | Btn.Right);
    expect(qcfStep).toContain(Btn.Right);
  });

  it('拼接后帧数与起始帧对得上，步与步之间留了空档', () => {
    const steps = comboDemoFor();
    const { frames, starts } = flattenSteps(steps);
    expect(starts).toHaveLength(steps.length);
    expect(frames.length).toBeGreaterThan(starts[steps.length - 1]!);
    // 每步起点之间至少隔了这一步的长度 + 2 帧空档
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(steps[i - 1]!.frames.length + 2);
    }
  });

  it('stepAt 能指出当前在第几步，越界返回 -1', () => {
    const { starts, frames } = flattenSteps(comboDemoFor());
    expect(stepAt(starts, 0)).toBe(0);
    expect(stepAt(starts, starts[1]!)).toBe(1);
    expect(stepAt(starts, frames.length + 10)).toBe(2);
    expect(stepAt([], 0)).toBe(-1);
  });
});

describe('连招演示的伤害（必须和真打出来的对得上）', () => {
  it('给了角色就按招式数据求和，不是随手估的数字', () => {
    const steps = comboDemoFor(KYO);
    const wave = KYO.moves['236A']!;
    const expectDmg = wave.hits.reduce((a, h) => a + h.damage, 0);
    const step2 = steps[1]!;
    expect(step2.damage).toBeGreaterThanOrEqual(expectDmg);
  });

  it('不带角色时不给伤害（不知道是谁，编一个数是骗人）', () => {
    for (const s of comboDemoFor()) expect(s.damage).toBeUndefined();
  });

  it('总伤害随连段推进单调不减', () => {
    const steps = comboDemoFor(KYO);
    let prev = -1;
    for (let i = 0; i < steps.length; i++) {
      const sum = steps.slice(0, i + 1).reduce((a, s) => a + (s.damage ?? 0), 0);
      expect(sum).toBeGreaterThanOrEqual(prev);
      prev = sum;
    }
    expect(totalDamage(steps)).toBeGreaterThan(0);
  });

  it('查不到的招式算 0，不抛异常（新角色没写 236A 也不会崩）', () => {
    const steps = comboDemoFor({ ...KYO, moves: {} } as typeof KYO);
    expect(totalDamage(steps)).toBe(0);
  });
});

describe('多套连招', () => {
  it('三套：入门 / 标准 / 高伤，难度依次递增', () => {
    const sets = comboSets(KYO);
    expect(sets.map((s) => s.id)).toEqual(['basic', 'standard', 'advanced']);
    expect(sets[0]!.name).toContain('入门');
    expect(sets[2]!.name).toContain('高伤');
  });

  it('入门套只用普通技（没有指令输入），新手照着能按出来', () => {
    const basic = comboSets(KYO)[0]!;
    expect(basic.steps.every((s) => (s.moves ?? []).every((m) => !m.includes('236') && !m.includes('623')))).toBe(true);
  });

  it('高伤套一定包含超必杀（不然不配叫高伤）', () => {
    const adv = comboSets(KYO)[2]!;
    expect(adv.steps.some((s) => (s.moves ?? []).some((m) => m.includes('236236')))).toBe(true);
  });

  it('每套都能算出伤害，且高伤 ≥ 入门', () => {
    const sets = comboSets(KYO);
    const d = sets.map((s) => totalDamage(s.steps));
    expect(d[0]!).toBeGreaterThan(0);
    expect(d[2]!).toBeGreaterThanOrEqual(d[0]!);
  });

  it('不给角色也能拿到三套（只是不带伤害），不会崩', () => {
    const sets = comboSets();
    expect(sets).toHaveLength(3);
    expect(totalDamage(sets[0]!.steps)).toBe(0);
  });
});
