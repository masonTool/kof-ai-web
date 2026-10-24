/**
 * 暴走莉安娜（KOF'97）：招式与莉安娜一致，更快更痛、血更少。
 */
import { LEONA } from './leona';
import { PALETTES } from './palette';
import { variantOf } from './variant';

export const OROCHI_LEONA = variantOf(LEONA, {
  id: 'orochi_leona',
  name: '暴走莉安娜',
  palette: PALETTES['orochiLeona']!,
  hp: 940,
  damage: 1.12,
  speed: 0.95,
});

export default OROCHI_LEONA;
