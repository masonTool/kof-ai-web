import { describe, expect, it } from 'vitest';
import iori from '../public/sheets/iori.json';
import orochiIori from '../public/sheets/orochi_iori.json';
import leona from '../public/sheets/leona.json';
import orochiLeona from '../public/sheets/orochi_leona.json';

/**
 * 暴走变体不单独出图，是从本体图集染色派生的（见 build-sheet.mjs --from --tint）。
 * 这里钉住"派生"的两条性质：几何与本体**完全一致**、图片文件**指向自己**。
 * 几何跑偏 = 打起来判定和画面对不上；image 指向本体 = 选暴走的人和本体长得一模一样。
 */
describe('暴走变体图集', () => {
  const pairs = [
    ['orochi_iori', orochiIori, iori],
    ['orochi_leona', orochiLeona, leona],
  ] as const;

  for (const [id, variant, base] of pairs) {
    it(`${id} 的动画与矩形和本体完全一致（只差颜色）`, () => {
      expect(Object.keys(variant.anims).sort()).toEqual(Object.keys(base.anims).sort());
      for (const anim of Object.keys(base.anims)) {
        const a = variant.anims[anim as keyof typeof variant.anims]!;
        const b = base.anims[anim as keyof typeof base.anims]!;
        expect(a.length, anim).toBe(b.length);
        a.forEach((f, i) => {
          expect(f).toEqual(b[i]); // 位置、尺寸、偏移逐帧一致
        });
      }
    });

    it(`${id} 用的是自己的图集文件，不是本体那张`, () => {
      expect(variant.image).toBe(`${id}.png`);
      expect(variant.image).not.toBe(base.image);
      expect(variant.scale).toBe(base.scale);
    });
  }
});
