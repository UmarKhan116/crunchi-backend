/** Cache lifetimes from the contract. */
export const TTL = {
  nearby: 60 * 60_000,
  details: 24 * 60 * 60_000,
  text: 60 * 60_000,
  autocomplete: 10 * 60_000,
  geocode: 24 * 60 * 60_000,
  photo: 24 * 60 * 60_000,
} as const;

/**
 * Place Details field list from the contract. Explicit so we only pay for
 * the SKUs we use.
 */
export const DETAILS_FIELDS = [
  'place_id',
  'name',
  'rating',
  'user_ratings_total',
  'formatted_address',
  'vicinity',
  'address_components',
  'geometry/location',
  'types',
  'price_level',
  'photos',
  'opening_hours',
  'utc_offset',
  'formatted_phone_number',
  'website',
  'url',
];

export const FEED_DEFAULT_RADIUS_M = 8000;
export const FEED_MAX_RADIUS_M = 48000;
export const FEED_DEFAULT_LIMIT = 10;
export const FEED_MAX_LIMIT = 20;
/** Google Nearby/Text Search return at most 3 pages of 20. */
export const GOOGLE_MAX_PAGES = 3;
/** Feed pattern: one post after every N places. */
export const PLACES_PER_POST = 2;

export const PHOTO_WIDTHS = [400, 800, 1200] as const;
export const PHOTO_DEFAULT_WIDTH = 800;
/** Photos in a feed item / a details response. */
export const FEED_PHOTOS = 1;
export const DETAILS_PHOTOS = 10;

/** Places the old app filtered out of the food feed. */
export const EXCLUDED_PLACE_TYPES = ['lodging', 'shopping_mall'];
