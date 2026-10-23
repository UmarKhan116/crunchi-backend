import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlaceCacheService } from './place-cache.service';
import { memoryCacheRepo } from '../../test/helpers/memory-cache-repo';

const BASE = 'https://api.test';
const PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

const details = {
  place_id: PLACE_ID,
  name: 'Trattoria',
  rating: 4.6,
  user_ratings_total: 321,
  formatted_address: '73-101 Hwy 111, Palm Desert, CA 92260, USA',
  address_components: [
    {
      long_name: 'Palm Desert',
      short_name: 'Palm Desert',
      types: ['locality', 'political'],
    },
  ],
  geometry: { location: { lat: 33.72, lng: -116.37 } },
  types: ['restaurant', 'food'],
  price_level: 2,
  photos: Array.from({ length: 12 }, (_, i) => ({
    photo_reference: `photo_ref_${i}_abcdefgh`,
    width: 4000,
    height: 3000,
    html_attributions: ['<a href="https://maps.google.com/x">Jane D</a>'],
  })),
  opening_hours: {
    periods: [{ open: { day: 0, time: '0000' } }],
    weekday_text: ['Monday: Open 24 hours'],
  },
  utc_offset: -420,
  formatted_phone_number: '(760) 555-0100',
  website: 'https://trattoria.example',
  url: 'https://maps.google.com/?cid=1',
};

function setup() {
  const google = {
    details: jest.fn().mockResolvedValue(details),
    textSearch: jest.fn().mockResolvedValue({
      results: [{ ...details, photos: details.photos.slice(0, 1) }],
      nextPageToken: 'text-p2',
    }),
    nextPage: jest.fn().mockResolvedValue({ results: [], nextPageToken: null }),
    autocomplete: jest.fn().mockResolvedValue([
      {
        place_id: 'p1',
        description: 'Pizza Place, Palm Desert',
        structured_formatting: {
          main_text: 'Pizza Place',
          secondary_text: 'Palm Desert, CA',
        },
      },
    ]),
    reverseGeocode: jest.fn().mockResolvedValue([
      {
        formatted_address: '1226 University Dr, Palm Desert, CA 92211, USA',
        types: ['street_address'],
        address_components: [
          { long_name: '1226', short_name: '1226', types: ['street_number'] },
          {
            long_name: 'University Drive',
            short_name: 'University Dr',
            types: ['route'],
          },
          {
            long_name: 'Palm Desert',
            short_name: 'Palm Desert',
            types: ['locality'],
          },
        ],
      },
    ]),
  };
  const cache = new PlaceCacheService(memoryCacheRepo() as any);
  const postQuery = { countByPlaceId: jest.fn().mockResolvedValue(3) };
  const restaurants = {
    query: jest.fn(
      async (...[sql]: [string, any[]?]): Promise<any[]> =>
        sql.includes('SELECT')
          ? [
              {
                place_id: PLACE_ID,
                likes_count: 2,
                mine: true,
                opening_periods: null,
                utc_offset_minutes: null,
              },
            ]
          : [],
    ),
  };
  const service = new PlacesService(
    google as any,
    cache,
    postQuery as any,
    {} as any,
    restaurants as any,
  );
  return { service, google, restaurants };
}

describe('PlacesService', () => {
  describe('details', () => {
    it('returns PlaceSummary + phone/website/mapsUrl, ≤10 proxied photos and review count', async () => {
      const { service } = setup();
      const res = await service.details(
        PLACE_ID,
        { userId: 1, baseUrl: BASE },
        { lat: 33.72, lng: -116.37 },
      );
      expect(res).toEqual(
        expect.objectContaining({
          placeId: PLACE_ID,
          name: 'Trattoria',
          rating: 4.6,
          userRatingsTotal: 321,
          address: '73-101 Hwy 111, Palm Desert, CA 92260, USA',
          city: 'Palm Desert',
          categoryLabel: 'Restaurant',
          priceLevel: 2,
          openingHours: {
            periods: [{ open: { day: 0, time: '0000' } }],
            weekdayText: ['Monday: Open 24 hours'],
          },
          utcOffsetMinutes: -420,
          distanceM: 0,
          likesCount: 2,
          isLiked: true,
          isFavorite: true,
          phone: '(760) 555-0100',
          website: 'https://trattoria.example',
          mapsUrl: 'https://maps.google.com/?cid=1',
          crunchiiReviewsCount: 3,
        }),
      );
      expect(res.photos).toHaveLength(10);
      expect(res.photos[0]).toEqual({
        ref: 'photo_ref_0_abcdefgh',
        url: `${BASE}/api/places/photo/photo_ref_0_abcdefgh?w=800`,
        width: 4000,
        height: 3000,
        attribution: 'Jane D',
      });
    });

    it('is cached for 24 h and writes the hours to our restaurant rows once', async () => {
      const { service, google, restaurants } = setup();
      await service.details(PLACE_ID, { baseUrl: BASE });
      await service.details(PLACE_ID, { baseUrl: BASE });
      expect(google.details).toHaveBeenCalledTimes(1);
      const updates = restaurants.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE restaurants'),
      );
      expect(updates).toHaveLength(1);
      expect(updates[0][1][0]).toBe(PLACE_ID);
      expect(JSON.parse(updates[0][1][1]).weekdayText).toEqual([
        'Monday: Open 24 hours',
      ]);
      expect(updates[0][1][2]).toBe(-420);
    });

    it('404s for an unknown place and caches that answer', async () => {
      const { service, google } = setup();
      google.details.mockResolvedValue(null);
      await expect(
        service.details(PLACE_ID, { baseUrl: BASE }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.details(PLACE_ID, { baseUrl: BASE }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(google.details).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed place ids before calling Google', async () => {
      const { service, google } = setup();
      await expect(
        service.details('../x', { baseUrl: BASE }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(google.details).not.toHaveBeenCalled();
    });

    it('guests get isLiked/isFavorite false', async () => {
      const { service } = setup();
      const res = await service.details(PLACE_ID, { baseUrl: BASE });
      expect([res.isLiked, res.isFavorite]).toEqual([false, false]);
    });
  });

  describe('search', () => {
    it('paginates with an opaque cursor and caches per normalised query + cell', async () => {
      const { service, google } = setup();
      const p1 = await service.search(
        { query: '  Tacos ', lat: 33.7222, lng: -116.3745 },
        { baseUrl: BASE },
      );
      expect(p1.items[0].placeId).toBe(PLACE_ID);
      expect(p1.nextCursor).toEqual(expect.any(String));
      expect(google.textSearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'tacos', lat: 33.72, lng: -116.37 }),
      );

      await service.search(
        { query: 'tacos', lat: 33.7231, lng: -116.3741 },
        { baseUrl: BASE },
      );
      expect(google.textSearch).toHaveBeenCalledTimes(1);

      const p2 = await service.search(
        { query: 'tacos', lat: 33.7222, lng: -116.3745, cursor: p1.nextCursor },
        { baseUrl: BASE },
      );
      expect(google.nextPage).toHaveBeenCalledWith('textsearch', 'text-p2');
      expect(p2).toEqual({ items: [], nextCursor: null });
    });

    it('rejects a bad cursor', async () => {
      const { service } = setup();
      await expect(
        service.search({ query: 'x', cursor: 'nope' }, { baseUrl: BASE }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('autocomplete maps predictions and caches them', async () => {
    const { service, google } = setup();
    const a = await service.autocomplete({
      input: 'Pizz',
      lat: 33.72,
      lng: -116.37,
      sessionToken: 's1',
    });
    const b = await service.autocomplete({
      input: 'pizz',
      lat: 33.72,
      lng: -116.37,
      sessionToken: 's2',
    });
    expect(a).toEqual([
      {
        placeId: 'p1',
        primaryText: 'Pizza Place',
        secondaryText: 'Palm Desert, CA',
      },
    ]);
    expect(b).toEqual(a);
    expect(google.autocomplete).toHaveBeenCalledTimes(1);
  });

  it('reverse geocode returns a street label and city per area cell', async () => {
    const { service, google } = setup();
    expect(await service.reverseGeocode(33.72221, -116.37449)).toEqual({
      label: '1226 University Dr',
      city: 'Palm Desert',
    });
    await service.reverseGeocode(33.7199, -116.3701); // same cell
    expect(google.reverseGeocode).toHaveBeenCalledTimes(1);
    expect(google.reverseGeocode).toHaveBeenCalledWith(33.72, -116.37);
  });
});
