/**
 * How a Crunchii category becomes a Google Nearby Search.
 *
 * The categories table has no Google columns. The current app searches
 * `type=restaurant` plus the category name as a keyword, so this keeps that
 * and only fixes names that make poor keywords ("Mexican/Latin"). Unknown
 * names fall back to the same rule. Change a mapping here and every client
 * (feed + /bootstrap categories) picks it up.
 */
export interface GoogleCategoryQuery {
  googleType: string | null;
  keyword: string | null;
}

const BY_NAME: Record<string, GoogleCategoryQuery> = {
  italian: { googleType: 'restaurant', keyword: 'italian' },
  asian: { googleType: 'restaurant', keyword: 'asian' },
  american: { googleType: 'restaurant', keyword: 'american' },
  'mexican/latin': { googleType: 'restaurant', keyword: 'mexican' },
  seafood: { googleType: 'restaurant', keyword: 'seafood' },
  'fast food': { googleType: 'restaurant', keyword: 'fast food' },
  desserts: { googleType: 'restaurant', keyword: 'dessert' },
  breakfast: { googleType: 'restaurant', keyword: 'breakfast' },
  mediterranean: { googleType: 'restaurant', keyword: 'mediterranean' },
  indian: { googleType: 'restaurant', keyword: 'indian' },
  'vegetarian/vegan': { googleType: 'restaurant', keyword: 'vegetarian' },
  steakhouses: { googleType: 'restaurant', keyword: 'steakhouse' },
};

export function googleQueryForCategory(name: string): GoogleCategoryQuery {
  const key = (name ?? '').trim().toLowerCase();
  if (BY_NAME[key]) return BY_NAME[key];
  const keyword = key
    .replace(/[/&,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { googleType: 'restaurant', keyword: keyword || null };
}

/** Used when there are no categories at all: plain "restaurants nearby". */
export const ALL_RESTAURANTS: GoogleCategoryQuery = {
  googleType: 'restaurant',
  keyword: null,
};
