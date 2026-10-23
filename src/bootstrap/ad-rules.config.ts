/**
 * Where the app inserts ads in the feed. The server never inserts ads; the
 * app does it with these rules. Fixed for now; Milestone 3 makes them
 * configurable (admin-editable), so keep reading them through this constant.
 */
export interface AdRules {
  /** One ad after every N feed items (0 = no ads). */
  adEvery: number;
  /** One AdMob banner after every N items (0 = banners off). */
  bannerEvery: number;
}

export const DEFAULT_AD_RULES: AdRules = { adEvery: 8, bannerEvery: 0 };
