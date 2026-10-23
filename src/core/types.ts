export const CATEGORIES = ['whisky', 'gin', 'vodka', 'rum', 'tequila', 'brandy', 'liqueur', 'vermouth', 'wine', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  whisky: 'Whisky',
  gin: 'Gin',
  vodka: 'Vodka',
  rum: 'Rum',
  tequila: 'Tequila',
  brandy: 'Brandy',
  liqueur: 'Liqueur',
  vermouth: 'Vermouth',
  wine: 'Wine',
  other: 'Other',
};

/** The owner's own tag for how hard a bottle is to replace. The app never looks this up. */
export const RARITIES = ['common', 'limited', 'numbered', 'allocated', 'discontinued', 'unknown'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  limited: 'Limited',
  numbered: 'Numbered',
  allocated: 'Allocated',
  discontinued: 'Discontinued',
  unknown: 'Unknown',
};

/** A price the owner typed from somewhere they looked. Three fields, no lookup. */
export interface MarketRef {
  amountCents: number;
  source?: string;
  date?: string;
}

/** One bottle on the shelf. Volume is whole millilitres, money is whole cents (Canadian dollars). */
export interface Bottle {
  id: string;
  name: string;
  category: Category;
  sizeMl: number;
  /** How full it is, as a whole percent from the slider. */
  fillPct: number;
  paidCents: number;
  boughtWhere?: string;
  boughtOn?: string;
  /** The owner marks it limited or numbered. */
  limited: boolean;
  /** Free text such as "214 of 1,000". */
  bottleNumber?: string;
  rarity: Rarity;
  market?: MarketRef;
  /** On the manual watchlist, with a note the owner wrote. */
  watch: boolean;
  watchNote?: string;
  /** The bottle counts as low at or under this fill percent. */
  lowPct: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** True only for the invented demo rows. */
  sample?: true;
}

export interface Settings {
  /** Size of one peg in millilitres. */
  pegMl: number;
  /** Low threshold given to a new bottle, in percent. */
  defaultLowPct: number;
}

export const DEFAULT_SETTINGS: Settings = { pegMl: 30, defaultLowPct: 20 };

/** A resized photo, kept in its own store and keyed by the bottle's id. */
export interface Photo {
  id: string;
  type: 'image/jpeg';
  bytes: Uint8Array;
}
