import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/chars';
import { IORI } from '../src/data/chars/iori';
import { KYO } from '../src/data/chars/kyo';
import { QUOTES, hasQuotes, winQuoteFor } from '../src/data/chars/quotes';
import { Match } from '../src/game/match';
import { drawResult, wrapText } from '../src/render/screens';
import { resultAnimFor } from '../src/render/renderer';
import { FakeCtx } from './helpers/fake-ctx';

describe('胜利台词', () => {
  it('每个在册角色都有专属台词（加角色别忘写）', () => {
    for (const char of ROSTER) expect(hasQuotes(char.id), char.id).toBe(true);
  });

  it('台词表里没有多余的角色', () => {
    const ids = new Set(ROSTER.map((c) => c.id));
    for (const id of Object.keys(QUOTES)) expect(ids.has(id), id).toBe(true);
  });

  it('每句都非空、且不会长到溢出台词框', () => {
    for (const [id, entry] of Object.entries(QUOTES)) {
      expect(entry.win.length, id).toBeGreaterThan(0);
      for (const line of entry.win) {
        expect(line.trim().length, `${id}: ${line}`).toBeGreaterThan(0);
        expect(line.length, `${id}: ${line}`).toBeLessThanOrEqual(40);
      }
    }
  });

  it('按胜场数轮换，同一胜场永远同一句（回放不会变）', () => {
    const first = winQuoteFor('kyo', 0);
    expect(winQuoteFor('kyo', 0)).toBe(first);
    const second = winQuoteFor('kyo', 1);
    expect(second).not.toBe(first);
    // 转一圈回到第一句
    expect(winQuoteFor('kyo', QUOTES['kyo']!.win.length)).toBe(first);
  });

  it('负数/超大胜场也不会取到 undefined', () => {
    for (const wins of [-3, 0, 7, 9999]) {
      expect(typeof winQuoteFor('kyo', wins)).toBe('string');
      expect(winQuoteFor('kyo', wins).length).toBeGreaterThan(0);
    }
  });

  it('未知角色回落到通用台词', () => {
    expect(winQuoteFor('根本没有这个人')).toBe('勝負あり。');
    expect(hasQuotes('根本没有这个人')).toBe(false);
  });
});

describe('结束后谁摆什么姿势', () => {
  const makeMatch = (): Match => new Match(KYO, IORI, { introFrames: 1, roundEndFrames: 1 }, 7);

  it('对局进行中不覆盖（照常按状态画）', () => {
    const m = makeMatch();
    expect(m.phase).toBe('intro');
    expect(resultAnimFor(m, 1)).toBeNull();
  });

  it('整场结束后：赢家胜利姿势、输家跪地', () => {
    const m = makeMatch();
    m.phase = 'over';
    m.matchWinner = 1;
    expect(resultAnimFor(m, 1)).toBe('win');
    expect(resultAnimFor(m, 2)).toBe('lose');
  });

  it('P2 赢的时候反过来', () => {
    const m = makeMatch();
    m.phase = 'over';
    m.matchWinner = 2;
    expect(resultAnimFor(m, 1)).toBe('lose');
    expect(resultAnimFor(m, 2)).toBe('win');
  });

  it('平局两边都不摆姿势', () => {
    const m = makeMatch();
    m.phase = 'over';
    m.matchWinner = 0;
    expect(resultAnimFor(m, 1)).toBeNull();
    expect(resultAnimFor(m, 2)).toBeNull();
  });
});

describe('台词框绘制', () => {
  it('wrapText 按字数折行，空串也返回一行', () => {
    expect(wrapText('1234567', 3)).toEqual(['123', '456', '7']);
    expect(wrapText('短', 20)).toEqual(['短']);
    expect(wrapText('', 20)).toEqual(['']);
  });

  it('结果屏会画出赢家名、WINS 和台词', () => {
    const ctx = new FakeCtx();
    drawResult(ctx, '草薙京', 'この程度か。', true);
    const all = ctx.texts.map((t) => t.text);
    expect(all).toContain('草薙京'); // 说话人
    expect(all).toContain('この程度か。');
    expect(all).toContain('按 A 回到标题');
    // "WINS" 交给 HUD 横幅，结果屏不再画一次（否则正中会有两行）
    expect(all).not.toContain('WINS');
  });

  it('长台词会折成多行（不会画出框外）', () => {
    const ctx = new FakeCtx();
    const long = 'あ'.repeat(45);
    drawResult(ctx, 'X', long, false);
    // text() 每行画两次（阴影在 y+1），所以先去掉"紧跟在上一行下面"的阴影行
    const ys = [...new Set(ctx.texts.filter((t) => t.text.startsWith('あ')).map((t) => t.y))].sort((a, b) => a - b);
    const bases = ys.filter((y) => !ys.includes(y - 1));
    expect(bases.length).toBe(3);
    // 每行都在框内（框从 y=148 起、高 44）
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(148);
      expect(y).toBeLessThanOrEqual(192);
    }
  });
});
