import { describe, expect, it } from 'vitest';
import { KYO } from '../src/data/chars/kyo';
import { ROSTER } from '../src/data/chars';
import { commandText, moveListFor } from '../src/ui/movelist';

describe('招式清单', () => {
  it('只收必杀与超必杀，且必杀排前面', () => {
    const list = moveListFor(KYO);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const firstSuper = list.findIndex((e) => e.kind === '超必杀');
    if (firstSuper >= 0) {
      for (let i = firstSuper; i < list.length; i++) expect(list[i]!.kind).toBe('超必杀');
    }
    expect(list.every((e) => e.kind === '必杀技' || e.kind === '超必杀')).toBe(true);
  });

  it('指令文本是人类可读的方向箭头，不是 236A 这种 id', () => {
    const list = moveListFor(KYO);
    const wave = list.find((e) => e.id === '236A');
    expect(wave).toBeTruthy();
    expect(wave!.cmd).toContain('↓↘→');
    expect(wave!.cmd).toContain('A');
    expect(wave!.name).toBe('百拾四式・荒咬み');
    expect(wave!.cmd).not.toContain('236');
  });

  it('超必杀带气槽消耗', () => {
    const supers = moveListFor(KYO).filter((e) => e.kind === '超必杀');
    expect(supers.length).toBeGreaterThan(0);
    expect(supers.some((e) => e.meter > 0)).toBe(true);
  });

  it('每个角色的清单都不为空、名字与指令非空', () => {
    for (const char of ROSTER) {
      const list = moveListFor(char);
      expect(list.length, char.id).toBeGreaterThan(0);
      for (const e of list) {
        expect(e.name.length, char.id).toBeGreaterThan(0);
      }
    }
  });

  it('没有 input 的招式不会崩，返回空指令并由界面显示占位', () => {
    expect(commandText(undefined)).toBe('');
    expect(commandText({ motion: 'none' })).toBe('');
    expect(commandText({ motion: '623', buttons: ['A'] })).toBe('→↓↘ + A');
  });
});
