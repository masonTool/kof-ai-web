import { describe, expect, it } from 'vitest';
import { frameRect, sheetCells, sheetSize } from '../src/render/sheet-export';

const spec = { anims: { idle: 2, walkF: 4, punch: 3 }, columns: 4, frameW: 48, frameH: 96 };

describe('素材模板排布', () => {
  it('整张图大小按总帧数与列数算', () => {
    // 2+4+3 = 9 帧，4 列 → 3 行
    expect(sheetSize(spec)).toEqual({ w: 192, h: 288 });
  });

  it('每帧的位置和 spriteSheetProvider 的切图规则一致（按声明顺序横排、满列换行）', () => {
    expect(frameRect(spec, 'idle', 0)).toEqual({ x: 0, y: 0, w: 48, h: 96 });
    expect(frameRect(spec, 'idle', 1)).toEqual({ x: 48, y: 0, w: 48, h: 96 });
    expect(frameRect(spec, 'walkF', 0)).toEqual({ x: 96, y: 0, w: 48, h: 96 });
    expect(frameRect(spec, 'walkF', 1)).toEqual({ x: 144, y: 0, w: 48, h: 96 });
    // 第 5 帧换行
    expect(frameRect(spec, 'walkF', 2)).toEqual({ x: 0, y: 96, w: 48, h: 96 });
  });

  it('越界帧返回 null（不会算出格子外的坐标）', () => {
    expect(frameRect(spec, 'idle', 2)).toBeNull();
    expect(frameRect(spec, '根本没这个动画', 0)).toBeNull();
  });

  it('展开的格子数量 = 总帧数，且坐标不重复', () => {
    const cells = sheetCells(spec);
    expect(cells).toHaveLength(9);
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(9);
  });
});
