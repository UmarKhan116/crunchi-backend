import {
  decodeCursor,
  encodeCursor,
  isNonNegativeInt,
} from '../../common/utils/cursor';
import { GOOGLE_MAX_PAGES, PLACES_PER_POST } from '../places.constants';

/**
 * Pure feed logic (no I/O) so it can be unit tested:
 * merging per-category Google pages, dedupe, the place/post interleave and
 * the cursor.
 */

export interface FeedCursor {
  v: 1;
  /** Places consumed from the merged, deduped place list. */
  pl: number;
  /** Posts consumed (SQL OFFSET). */
  po: number;
  /** Places shown since the last post, so the 2:1 pattern continues across pages. */
  sp: number;
  /** Google result pages loaded per category (1..3). */
  d: number;
}

export const INITIAL_FEED_CURSOR: FeedCursor = {
  v: 1,
  pl: 0,
  po: 0,
  sp: 0,
  d: 1,
};

const isFeedCursor = (c: any): c is FeedCursor =>
  c &&
  c.v === 1 &&
  isNonNegativeInt(c.pl) &&
  isNonNegativeInt(c.po) &&
  isNonNegativeInt(c.sp) &&
  Number.isInteger(c.d) &&
  c.d >= 1 &&
  c.d <= GOOGLE_MAX_PAGES;

export const encodeFeedCursor = (c: FeedCursor) => encodeCursor(c);
export const decodeFeedCursor = (s?: string | null) =>
  decodeCursor<FeedCursor>(s, isFeedCursor) ?? INITIAL_FEED_CURSOR;

export interface Labelled<T> {
  item: T;
  label: string | null;
}

/**
 * Merges result pages from several category searches into one list:
 * page level 1 of every category first, then level 2, …; within a level the
 * categories are taken round-robin so cuisines mix. The first occurrence of a
 * place id wins (with that category's label). Because later levels are only
 * appended, loading another level never reorders what was already shown,
 * which keeps cursor offsets valid.
 *
 * `levels[d][c]` = results of category c at page level d.
 */
export function mergePlaces<T>(
  levels: { results: T[]; label: string | null }[][],
  idOf: (item: T) => string,
  keep: (item: T) => boolean = () => true,
): Labelled<T>[] {
  const seen = new Set<string>();
  const merged: Labelled<T>[] = [];
  for (const level of levels) {
    const longest = Math.max(0, ...level.map((c) => c.results.length));
    for (let i = 0; i < longest; i++) {
      for (const category of level) {
        const item = category.results[i];
        if (item === undefined) continue;
        const id = idOf(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (keep(item)) merged.push({ item, label: category.label });
      }
    }
  }
  return merged;
}

export type Interleaved<P, Q> =
  | { kind: 'place'; value: P }
  | { kind: 'post'; value: Q };

/**
 * One post after every PLACES_PER_POST places while both exist; when one
 * stream runs out the other continues alone. `places`/`posts` are the
 * windows starting at the cursor; a window shorter than `limit` means that
 * stream is exhausted.
 */
export function interleave<P, Q>(
  places: P[],
  posts: Q[],
  limit: number,
  placesSincePost: number,
): {
  items: Interleaved<P, Q>[];
  usedPlaces: number;
  usedPosts: number;
  placesSincePost: number;
} {
  const items: Interleaved<P, Q>[] = [];
  let i = 0;
  let j = 0;
  let since = placesSincePost;
  while (items.length < limit && (i < places.length || j < posts.length)) {
    const postDue = since >= PLACES_PER_POST || i >= places.length;
    if (postDue && j < posts.length) {
      items.push({ kind: 'post', value: posts[j++] });
      since = 0;
    } else if (i < places.length) {
      items.push({ kind: 'place', value: places[i++] });
      since++;
    } else {
      items.push({ kind: 'post', value: posts[j++] });
      since = 0;
    }
  }
  return { items, usedPlaces: i, usedPosts: j, placesSincePost: since };
}
