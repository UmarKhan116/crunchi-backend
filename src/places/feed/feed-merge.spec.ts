import { BadRequestException } from '@nestjs/common';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  INITIAL_FEED_CURSOR,
  interleave,
  mergePlaces,
} from './feed-merge';
import { encodeCursor } from '../../common/utils/cursor';

const ids = (xs: { item: string }[]) => xs.map((x) => x.item);

describe('mergePlaces', () => {
  it('round-robins categories within a page level and dedupes by id', () => {
    const merged = mergePlaces(
      [
        [
          { results: ['a', 'b', 'c'], label: 'Italian' },
          { results: ['x', 'b', 'y'], label: 'Pizza' },
        ],
      ],
      (s) => s,
    );
    expect(ids(merged)).toEqual(['a', 'x', 'b', 'c', 'y']);
    // first occurrence keeps its category label
    expect(merged.find((m) => m.item === 'b').label).toBe('Italian');
  });

  it('appends later page levels after earlier ones, so loading more never reorders', () => {
    const level1 = [
      { results: ['a', 'b'], label: 'A' },
      { results: ['x'], label: 'X' },
    ];
    const before = ids(mergePlaces([level1], (s) => s));
    const after = ids(
      mergePlaces(
        [
          level1,
          [
            { results: ['c', 'x'], label: 'A' },
            { results: ['y'], label: 'X' },
          ],
        ],
        (s) => s,
      ),
    );
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toEqual(['a', 'x', 'b', 'c', 'y']);
  });

  it('drops places rejected by keep() without letting a duplicate replace them', () => {
    const merged = mergePlaces(
      [
        [
          { results: ['a', 'bad'], label: null },
          { results: ['bad', 'b'], label: null },
        ],
      ],
      (s) => s,
      (s) => s !== 'bad',
    );
    expect(ids(merged)).toEqual(['a', 'b']);
  });
});

describe('interleave', () => {
  const P = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const Q = (n: number) => Array.from({ length: n }, (_, i) => `q${i + 1}`);
  const seq = (r: ReturnType<typeof interleave<string, string>>) =>
    r.items.map((i) => i.value).join(' ');

  it('puts 1 post after every 2 places', () => {
    const r = interleave(P(6), Q(3), 9, 0);
    expect(seq(r)).toBe('p1 p2 q1 p3 p4 q2 p5 p6 q3');
    expect([r.usedPlaces, r.usedPosts, r.placesSincePost]).toEqual([6, 3, 0]);
  });

  it('continues with places only when posts run out', () => {
    expect(seq(interleave(P(5), Q(1), 10, 0))).toBe('p1 p2 q1 p3 p4 p5');
  });

  it('continues with posts only when places run out', () => {
    expect(seq(interleave(P(1), Q(4), 10, 0))).toBe('p1 q1 q2 q3 q4');
  });

  it('respects the limit and reports what it used', () => {
    const r = interleave(P(10), Q(10), 4, 0);
    expect(seq(r)).toBe('p1 p2 q1 p3');
    expect([r.usedPlaces, r.usedPosts, r.placesSincePost]).toEqual([3, 1, 1]);
  });

  it('carries the pattern across pages via placesSincePost', () => {
    // previous page ended after 1 place since the last post
    expect(seq(interleave(P(3), Q(2), 4, 1))).toBe('p1 q1 p2 p3');
  });

  it('returns nothing when both streams are empty', () => {
    const r = interleave([], [], 10, 0);
    expect(r.items).toEqual([]);
  });
});

describe('feed cursor', () => {
  it('round-trips and is opaque (base64url)', () => {
    const c = { v: 1 as const, pl: 12, po: 5, sp: 1, d: 2 };
    const s = encodeFeedCursor(c);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFeedCursor(s)).toEqual(c);
  });

  it('starts from the beginning without a cursor', () => {
    expect(decodeFeedCursor(undefined)).toEqual(INITIAL_FEED_CURSOR);
    expect(decodeFeedCursor('')).toEqual(INITIAL_FEED_CURSOR);
  });

  it.each([
    'not-base64-json!!',
    encodeCursor({ v: 2, pl: 0, po: 0, sp: 0, d: 1 }),
    encodeCursor({ v: 1, pl: -1, po: 0, sp: 0, d: 1 }),
    encodeCursor({ v: 1, pl: 0, po: 0, sp: 0, d: 4 }),
    encodeCursor({ v: 1, pl: '0', po: 0, sp: 0, d: 1 }),
  ])('rejects a tampered cursor %s with 400', (bad) => {
    expect(() => decodeFeedCursor(bad)).toThrow(BadRequestException);
  });
});
