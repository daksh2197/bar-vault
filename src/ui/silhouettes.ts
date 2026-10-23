/**
 * One simple outline per category, drawn by hand on a 60 by 130 grid with the bottle's centre at x = 30.
 * `bodyTop` and `bodyBottom` mark where the liquid can sit, so the fill level is drawn from the percent.
 */

import type { Category } from '../core/types';

export const SIL_WIDTH = 60;
export const SIL_HEIGHT = 130;

export interface Silhouette {
  d: string;
  bodyTop: number;
  bodyBottom: number;
}

export const SILHOUETTES: Record<Category, Silhouette> = {
  whisky: { d: 'M24 5H36V28L47 38V121Q47 127 41 127H19Q13 127 13 121V38L24 28Z', bodyTop: 38, bodyBottom: 127 },
  gin: { d: 'M25 4H35V34Q46 46 46 62V120Q46 127 40 127H20Q14 127 14 120V62Q14 46 25 34Z', bodyTop: 46, bodyBottom: 127 },
  vodka: { d: 'M26 8H34V24L40 32Q44 36 44 42V121Q44 127 38 127H22Q16 127 16 121V42Q16 36 20 32L26 24Z', bodyTop: 36, bodyBottom: 127 },
  rum: { d: 'M25 6H35V30Q50 38 50 58V118Q50 127 41 127H19Q10 127 10 118V58Q10 38 25 30Z', bodyTop: 44, bodyBottom: 127 },
  tequila: { d: 'M23 20H37V34Q52 40 52 56V119Q52 127 44 127H16Q8 127 8 119V56Q8 40 23 34Z', bodyTop: 44, bodyBottom: 127 },
  brandy: { d: 'M26 6H34V28Q34 36 44 46Q52 56 52 82V114Q52 127 40 127H20Q8 127 8 114V82Q8 56 16 46Q26 36 26 28Z', bodyTop: 50, bodyBottom: 127 },
  liqueur: { d: 'M20 32H40V40Q50 46 50 60V119Q50 127 42 127H18Q10 127 10 119V60Q10 46 20 40Z', bodyTop: 48, bodyBottom: 127 },
  vermouth: { d: 'M26 4H34V40L40 52V120Q40 127 34 127H26Q20 127 20 120V52L26 40Z', bodyTop: 52, bodyBottom: 127 },
  wine: { d: 'M26 3H34V44Q47 58 47 74V120Q47 127 40 127H20Q13 127 13 120V74Q13 58 26 44Z', bodyTop: 66, bodyBottom: 127 },
  other: { d: 'M25 14H35V32L44 40V121Q44 127 38 127H22Q16 127 16 121V40L25 32Z', bodyTop: 40, bodyBottom: 127 },
};

/** The y where the liquid starts for a fill percent: the body bottom at 0, the body top at 100. */
export function liquidTop(sil: Pick<Silhouette, 'bodyTop' | 'bodyBottom'>, fillPct: number): number {
  const pct = Math.min(100, Math.max(0, Math.round(Number.isFinite(fillPct) ? fillPct : 0)));
  const body = sil.bodyBottom - sil.bodyTop;
  return sil.bodyBottom - Math.round((body * pct) / 100);
}
