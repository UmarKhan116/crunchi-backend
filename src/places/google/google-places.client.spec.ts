import {
  BadGatewayException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GooglePlacesClient } from './google-places.client';
import { DETAILS_FIELDS } from '../places.constants';

const json = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  }) as unknown as Response;

function client(key: string | undefined = 'server-key') {
  const c = new GooglePlacesClient({
    get: (k: string) => (k === 'GOOGLE_PLACES_API_KEY' ? key : undefined),
  } as unknown as ConfigService);
  (c as any).sleep = jest.fn(async () => undefined);
  return c;
}

describe('GooglePlacesClient (legacy web service, fetch mocked)', () => {
  let fetchMock: jest.SpyInstance;
  const urls = () => fetchMock.mock.calls.map(([u]) => new URL(u));

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('nearbySearch calls place/nearbysearch with the server key and params', async () => {
    fetchMock.mockResolvedValue(
      json({
        status: 'OK',
        results: [{ place_id: 'a' }],
        next_page_token: 'n2',
      }),
    );
    const page = await client().nearbySearch({
      lat: 33.72,
      lng: -116.37,
      radiusM: 8000,
      type: 'restaurant',
      keyword: 'italian',
      openNow: true,
    });
    expect(page).toEqual({ results: [{ place_id: 'a' }], nextPageToken: 'n2' });
    const [u] = urls();
    expect(u.origin + u.pathname).toBe(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
    );
    expect(Object.fromEntries(u.searchParams)).toEqual({
      location: '33.72,-116.37',
      radius: '8000',
      type: 'restaurant',
      keyword: 'italian',
      opennow: 'true',
      key: 'server-key',
    });
  });

  it('details sends the explicit field list and returns null for NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(json({ status: 'NOT_FOUND' }));
    expect(await client().details('ChIJx', DETAILS_FIELDS)).toBeNull();
    expect(urls()[0].searchParams.get('fields')).toBe(
      'place_id,name,rating,user_ratings_total,formatted_address,vicinity,address_components,' +
        'geometry/location,types,price_level,photos,opening_hours,utc_offset,' +
        'formatted_phone_number,website,url',
    );
  });

  it('retries a not-yet-valid page token once, then gives up quietly', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 'INVALID_REQUEST' }))
      .mockResolvedValueOnce(
        json({ status: 'OK', results: [{ place_id: 'p2' }] }),
      );
    const c = client();
    expect(await c.nextPage('nearbysearch', 'tok')).toEqual({
      results: [{ place_id: 'p2' }],
      nextPageToken: null,
    });
    expect((c as any).sleep).toHaveBeenCalledWith(2000);

    fetchMock.mockResolvedValue(json({ status: 'INVALID_REQUEST' }));
    expect(await c.nextPage('nearbysearch', 'expired')).toEqual({
      results: [],
      nextPageToken: null,
    });
  });

  it('maps quota / denied errors to 502 without leaking the key', async () => {
    fetchMock.mockResolvedValue(
      json({
        status: 'OVER_QUERY_LIMIT',
        error_message: 'You have exceeded your quota',
      }),
    );
    const err = await client()
      .nearbySearch({ lat: 1, lng: 2, radiusM: 1000 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(err.getResponse())).not.toContain('server-key');
  });

  it('fails with 503 when no key is configured, without calling Google', async () => {
    await expect(
      client('').nearbySearch({ lat: 1, lng: 2, radiusM: 1000 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('photo returns image bytes and maps a bad reference to 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg; charset=binary' }),
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 1]).buffer,
    } as unknown as Response);
    const photo = await client().photo('REF', 800);
    expect(photo.contentType).toBe('image/jpeg');
    expect([...photo.bytes]).toEqual([0xff, 0xd8, 1]);
    expect(Object.fromEntries(urls()[0].searchParams)).toEqual({
      photo_reference: 'REF',
      maxwidth: '800',
      key: 'server-key',
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'text/html' }),
    } as unknown as Response);
    await expect(client().photo('BAD', 800)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reverseGeocode uses the Geocoding API', async () => {
    fetchMock.mockResolvedValue(
      json({ status: 'OK', results: [{ formatted_address: 'x' }] }),
    );
    expect(await client().reverseGeocode(33.72, -116.37)).toEqual([
      { formatted_address: 'x' },
    ]);
    const [u] = urls();
    expect(u.pathname).toBe('/maps/api/geocode/json');
    expect(u.searchParams.get('latlng')).toBe('33.72,-116.37');
  });
});
