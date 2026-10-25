import { describe, expect, it, beforeEach } from 'vitest';
import { ensurePortraits, portraitCount, portraitFor, resetPortraits } from '../src/render/portraits';

describe('人物头像', () => {
  beforeEach(() => resetPortraits());

  it('node 环境没有 Image：预载是空操作，取头像返回 null（绘制层回落画小人）', () => {
    ensurePortraits(['kyo', 'iori']);
    expect(portraitFor('kyo')).toBeNull();
    expect(portraitCount()).toBe(0);
  });

  it('重复预载不会重复请求（按 id 去重）', () => {
    ensurePortraits(['kyo', 'kyo', 'iori']);
    ensurePortraits(['iori']);
    expect(portraitCount()).toBe(0); // 没 Image 就一直是 0，但不应抛错
  });

  it('清空后回到初始状态', () => {
    ensurePortraits(['kyo']);
    resetPortraits();
    expect(portraitCount()).toBe(0);
    expect(portraitFor('kyo')).toBeNull();
  });
});
