/**
 * 暴走八神庵（KOF'97）：招式与庵完全一致，但更快更痛、血更少。
 * 靠 `variantOf()` 从本体派生——本体调招式，暴走版自动跟着变。
 */
import { IORI } from './iori';
import { PALETTES } from './palette';
import { variantOf } from './variant';

export const OROCHI_IORI = variantOf(IORI, {
  id: 'orochi_iori',
  name: '暴走八神庵',
  palette: PALETTES['orochiIori']!,
  hp: 950,
  damage: 1.15,
  speed: 0.94,
});

export default OROCHI_IORI;
