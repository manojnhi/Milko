import { round2 } from './money.js';

// Purane Milko database (727 entries) se: Magha = Litre / 1.176 (2 decimal).
export const LITRE_PER_MAGHA = 1.176;
export const PAY_UNITS = ['L', 'Magha'];
export const QTY_DISPLAYS = ['L', 'Magha', 'both'];

export const factorOf = (value) => (Number(value) > 0 ? Number(value) : LITRE_PER_MAGHA);
export const toMagha = (litre, factor) => round2(Number(litre) / factorOf(factor));
export const toLitre = (magha, factor) => round2(Number(magha) * factorOf(factor));

/**
 * Milkman ka apna price, Fat/SNF ke hisab se ghat-ta badhta.
 * rate = price × (fatShare × fat/stdFat + (100 − fatShare) × snf/stdSnf) / 100
 * Standard par rate = price. aboveStd = 0 ho to standard se upar nahi badhta (purana system).
 * 65, 6.5/9, share 52 => Fat×8 + SNF×5.3333 (purane database ke factors).
 */
export function linkedRate(p, fat, snf) {
  const f = p.above_std ? Number(fat) : Math.min(Number(fat), p.std_fat);
  const s = p.above_std ? Number(snf) : Math.min(Number(snf), p.std_snf);
  return round2((p.price * ((p.fat_share * f) / p.std_fat + ((100 - p.fat_share) * s) / p.std_snf)) / 100);
}
