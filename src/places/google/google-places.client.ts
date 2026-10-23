import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGeocodeResult,
  GooglePage,
  GooglePhotoBytes,
  GooglePlace,
  GooglePrediction,
} from './google-places.types';

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 10_000;
/** Google needs a moment before a next_page_token becomes valid. */
const PAGE_TOKEN_RETRY_DELAY_MS = 2_000;

export interface NearbySearchParams {
  lat: number;
  lng: number;
  radiusM: number;
  type?: string | null;
  keyword?: string | null;
  openNow?: boolean;
}

export interface TextSearchParams {
  query: string;
  lat?: number | null;
  lng?: number | null;
  radiusM?: number | null;
  openNow?: boolean;
}

export interface AutocompleteParams {
  input: string;
  lat?: number | null;
  lng?: number | null;
  sessionToken?: string | null;
}

/**
 * The only class that talks to Google. It wraps the LEGACY Places web service
 * (the one the app already calls, so the key's enabled APIs match) plus the
 * Geocoding API for reverse geocoding. Switching to Places API (New) should
 * only touch this file and google-places.types.ts / place-mapper.ts.
 *
 * Returns raw Google objects. Throws:
 *  - NotFoundException for unknown place ids / photo refs,
 *  - ServiceUnavailableException when no key is configured or Google is down,
 *  - BadGatewayException for other Google errors (quota, denied, …).
 */
@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Overridable in tests to skip the page-token delay. */
  protected sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private get key(): string {
    const key = this.config.get<string>('GOOGLE_PLACES_API_KEY')?.trim();
    if (!key) {
      this.logger.error('GOOGLE_PLACES_API_KEY is not set');
      throw new ServiceUnavailableException(
        'Places are not available right now',
      );
    }
    return key;
  }

  async nearbySearch(p: NearbySearchParams): Promise<GooglePage> {
    const params: Record<string, string> = {
      location: `${p.lat},${p.lng}`,
      radius: String(Math.round(p.radiusM)),
    };
    if (p.type) params.type = p.type;
    if (p.keyword) params.keyword = p.keyword;
    if (p.openNow) params.opennow = 'true';
    return this.page(await this.placesJson('nearbysearch', params));
  }

  async textSearch(p: TextSearchParams): Promise<GooglePage> {
    const params: Record<string, string> = { query: p.query };
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      params.location = `${p.lat},${p.lng}`;
      if (p.radiusM) params.radius = String(Math.round(p.radiusM));
    }
    if (p.openNow) params.opennow = 'true';
    return this.page(await this.placesJson('textsearch', params));
  }

  /**
   * Follows a next_page_token. Returns an empty last page if Google no longer
   * accepts the token (they expire), so callers simply stop paginating.
   */
  async nextPage(
    endpoint: 'nearbysearch' | 'textsearch',
    pageToken: string,
  ): Promise<GooglePage> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = await this.placesJson(
        endpoint,
        { pagetoken: pageToken },
        { allowInvalidRequest: true },
      );
      if (body.status !== 'INVALID_REQUEST') return this.page(body);
      if (attempt === 0) await this.sleep(PAGE_TOKEN_RETRY_DELAY_MS);
    }
    this.logger.warn(`${endpoint} page token rejected; treating as last page`);
    return { results: [], nextPageToken: null };
  }

  /** Place Details with an explicit field list. Null when Google has no such place. */
  async details(
    placeId: string,
    fields: string[],
  ): Promise<GooglePlace | null> {
    const body = await this.placesJson(
      'details',
      { place_id: placeId, fields: fields.join(',') },
      { allowNotFound: true, allowInvalidRequest: true },
    );
    if (body.status === 'NOT_FOUND' || body.status === 'INVALID_REQUEST') {
      return null;
    }
    return body.result ?? null;
  }

  async autocomplete(p: AutocompleteParams): Promise<GooglePrediction[]> {
    const params: Record<string, string> = { input: p.input };
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      params.location = `${p.lat},${p.lng}`;
      params.radius = '50000';
    }
    if (p.sessionToken) params.sessiontoken = p.sessionToken;
    const body = await this.placesJson('autocomplete', params);
    return body.predictions ?? [];
  }

  /** Geocoding API (latlng → addresses). Must be enabled on the same key. */
  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<GoogleGeocodeResult[]> {
    const body = await this.getJson(GEOCODE_URL, { latlng: `${lat},${lng}` });
    this.assertStatus(body, 'geocode', {});
    return body.results ?? [];
  }

  /** Image bytes for a photo reference (Google answers with a redirect we follow). */
  async photo(
    photoReference: string,
    maxWidth: number,
  ): Promise<GooglePhotoBytes> {
    const url = this.url(`${PLACES_BASE}/photo`, {
      photo_reference: photoReference,
      maxwidth: String(maxWidth),
    });
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      this.logger.error(`photo request failed: ${error?.message}`);
      throw new ServiceUnavailableException('Photo is not available right now');
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (res.status === 400 || res.status === 404) {
      throw new NotFoundException('Photo not found');
    }
    if (!res.ok || !contentType.startsWith('image/')) {
      this.logger.warn(`photo request returned ${res.status} ${contentType}`);
      throw new BadGatewayException('Photo is not available right now');
    }
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: contentType.split(';')[0].trim(),
    };
  }

  // ---------------------------------------------------------------------------

  private page(body: any): GooglePage {
    return {
      results: body.results ?? [],
      nextPageToken: body.next_page_token ?? null,
    };
  }

  private async placesJson(
    endpoint: string,
    params: Record<string, string>,
    allow: { allowNotFound?: boolean; allowInvalidRequest?: boolean } = {},
  ): Promise<any> {
    const body = await this.getJson(`${PLACES_BASE}/${endpoint}/json`, params);
    this.assertStatus(body, endpoint, allow);
    return body;
  }

  private assertStatus(
    body: any,
    endpoint: string,
    allow: { allowNotFound?: boolean; allowInvalidRequest?: boolean },
  ) {
    const status = body?.status;
    if (status === 'OK' || status === 'ZERO_RESULTS') return;
    if (status === 'NOT_FOUND' && allow.allowNotFound) return;
    if (status === 'INVALID_REQUEST' && allow.allowInvalidRequest) return;
    // Never log the URL: it contains the key.
    this.logger.error(
      `Google ${endpoint} failed: ${status} ${body?.error_message ?? ''}`.trim(),
    );
    if (status === 'INVALID_REQUEST') {
      throw new BadGatewayException('Invalid request to the places service');
    }
    throw new BadGatewayException('Places are not available right now');
  }

  private async getJson(base: string, params: Record<string, string>) {
    let res: Response;
    try {
      res = await fetch(this.url(base, params), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Google request failed: ${error?.message}`);
      throw new ServiceUnavailableException(
        'Places are not available right now',
      );
    }
    if (!res.ok) {
      this.logger.error(`Google HTTP ${res.status}`);
      throw new BadGatewayException('Places are not available right now');
    }
    return res.json();
  }

  private url(base: string, params: Record<string, string>): string {
    const search = new URLSearchParams({ ...params, key: this.key });
    return `${base}?${search.toString()}`;
  }
}
