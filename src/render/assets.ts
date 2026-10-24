/**
 * 素材入口（唯一一处）。
 *
 * 现在所有角色都是程序化绘制（没有素材）。将来若用户提供自绘贴图，
 * 在这里塞一个 `AssetProvider` 就能整只换皮：绘制层先问 `spriteFor()`，
 * 拿到帧就贴图，拿不到就回落到骨架绘制。**玩法/数据层完全不需要改。**
 */
export interface SpriteFrame {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 贴图相对角色原点的偏移（脚底中心）；不写就按帧尺寸居中底部对齐 */
  offsetX?: number;
  offsetY?: number;
}

export interface AssetProvider {
  /** 取某个角色某个动画某一帧的贴图；没有就返回 null（回落程序化绘制） */
  fighter(charId: string, anim: string, frame: number): SpriteFrame | null;
}

let provider: AssetProvider | null = null;

export function setAssetProvider(next: AssetProvider | null): void {
  provider = next;
}

export function currentAssetProvider(): AssetProvider | null {
  return provider;
}

export function hasCustomArt(): boolean {
  return provider !== null;
}

export function spriteFor(charId: string, anim: string, frame: number): SpriteFrame | null {
  if (!provider) return null;
  return provider.fighter(charId, anim, frame);
}
