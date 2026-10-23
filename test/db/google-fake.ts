/* Test helper only: Google Places/Geocoding fake for the DB HTTP tests. */
import * as path from 'path';

export const ORIGIN = { lat: 33.7222, lng: -116.3745 };
export const PLACE_ID = 'ChIJ_test_place_0001';
export const PHOTO_REF = 'AUGGfZtestPhotoReference_0001';
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
export const STORAGE = path.resolve(__dirname, '..', '..', 'storage');

export const googlePlace = {
  place_id: PLACE_ID,
  name: 'Trattoria Test',
  rating: 4.6,
  user_ratings_total: 120,
  vicinity: '1226 University Dr, Palm Desert',
  geometry: { location: { lat: ORIGIN.lat + 0.002, lng: ORIGIN.lng } },
  types: ['restaurant', 'food'],
  photos: [{ photo_reference: PHOTO_REF, width: 1600, height: 1200 }],
  opening_hours: { open_now: true },
};

export function fakeGoogle(url: string): Response {
  const u = new URL(url);
  const json = (body: unknown) =>
    ({
      ok: true,
      status: 200,
      json: async () => body,
      headers: new Headers(),
    }) as any;
  if (u.searchParams.get('key') !== 'test-places-key')
    throw new Error('missing key');
  switch (u.pathname) {
    case '/maps/api/place/nearbysearch/json':
      return json({ status: 'OK', results: [googlePlace] });
    case '/maps/api/place/details/json': {
      const id = u.searchParams.get('place_id');
      // Test ids: *MISSING* → Google NOT_FOUND, *BROKEN* → network error.
      if (id.includes('MISSING')) return json({ status: 'NOT_FOUND' });
      if (id.includes('BROKEN')) throw new Error('getaddrinfo ENOTFOUND');
      return json({
        status: 'OK',
        result: {
          ...googlePlace,
          place_id: id,
          formatted_address: '1226 University Dr, Palm Desert, CA 92211, USA',
          opening_hours: {
            periods: [
              {
                open: { day: 1, time: '1100' },
                close: { day: 1, time: '2200' },
              },
            ],
            weekday_text: ['Monday: 11:00 AM – 10:00 PM'],
          },
          utc_offset: -420,
          formatted_phone_number: '(760) 555-0100',
          website: 'https://example.com',
          url: 'https://maps.google.com/?cid=1',
        },
      });
    }
    case '/maps/api/place/textsearch/json':
      return json({ status: 'OK', results: [googlePlace] });
    case '/maps/api/place/autocomplete/json':
      return json({
        status: 'OK',
        predictions: [
          {
            place_id: PLACE_ID,
            structured_formatting: {
              main_text: 'Trattoria Test',
              secondary_text: 'Palm Desert',
            },
          },
        ],
      });
    case '/maps/api/geocode/json':
      return json({
        status: 'OK',
        results: [
          {
            types: ['street_address'],
            address_components: [
              {
                long_name: '1226',
                short_name: '1226',
                types: ['street_number'],
              },
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
        ],
      });
    case '/maps/api/place/photo':
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () =>
          JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length),
      } as any;
  }
  throw new Error(`unexpected Google call ${u.pathname}`);
}
