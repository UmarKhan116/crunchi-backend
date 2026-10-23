import {
  OpeningHours,
  Photo,
  PlaceSummary,
  PostPlace,
} from '../common/contract/types';
import { haversineMetres } from '../common/utils/geo';
import {
  GoogleAddressComponent,
  GooglePhoto,
  GooglePlace,
} from './google/google-places.types';
import { EXCLUDED_PLACE_TYPES, PHOTO_DEFAULT_WIDTH } from './places.constants';

/** Proxy URL for a Google photo; the key never reaches the app. */
export function photoProxyUrl(
  baseUrl: string,
  ref: string,
  width = PHOTO_DEFAULT_WIDTH,
) {
  return `${baseUrl}/api/places/photo/${encodeURIComponent(ref)}?w=${width}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export function mapPhotos(
  photos: GooglePhoto[] | undefined,
  baseUrl: string,
  max: number,
): Photo[] {
  return (photos ?? [])
    .filter((p) => p?.photo_reference)
    .slice(0, max)
    .map((p) => {
      const photo: Photo = {
        ref: p.photo_reference,
        url: photoProxyUrl(baseUrl, p.photo_reference),
        width: p.width ?? null,
        height: p.height ?? null,
      };
      const attribution = p.html_attributions
        ?.map(stripHtml)
        .filter(Boolean)
        .join(', ');
      if (attribution) photo.attribution = attribution;
      return photo;
    });
}

/** Contract OpeningHours, or null when Google gave no periods (Nearby only has open_now). */
export function mapOpeningHours(place: GooglePlace): OpeningHours {
  const periods = place.opening_hours?.periods;
  if (!periods?.length) return null;
  return {
    periods: periods.map((p) => ({
      open: { day: p.open.day, time: p.open.time },
      ...(p.close ? { close: { day: p.close.day, time: p.close.time } } : {}),
    })),
    weekdayText: place.opening_hours?.weekday_text ?? [],
  };
}

export function mapUtcOffset(place: GooglePlace): number | null {
  const v = place.utc_offset_minutes ?? place.utc_offset;
  return typeof v === 'number' ? v : null;
}

function component(
  components: GoogleAddressComponent[] | undefined,
  ...types: string[]
) {
  for (const type of types) {
    const found = components?.find((c) => c.types?.includes(type));
    if (found) return found;
  }
  return undefined;
}

/**
 * City from address components when we have them (details), otherwise a
 * best guess from the address text: Nearby's vicinity ends with the city
 * ("1226 University Dr, Palm Desert"); a formatted address has it third
 * from the end ("…, Palm Desert, CA 92260, USA").
 */
export function cityOf(place: GooglePlace): string | null {
  const c = component(
    place.address_components,
    'locality',
    'postal_town',
    'sublocality',
    'administrative_area_level_2',
  );
  if (c) return c.long_name;
  if (place.vicinity?.includes(',')) {
    return place.vicinity.split(',').pop().trim() || null;
  }
  const parts = place.formatted_address?.split(',').map((s) => s.trim()) ?? [];
  if (parts.length >= 3) return parts[parts.length - 3] || null;
  return null;
}

const GENERIC_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'food',
  'store',
]);

/** "meal_takeaway" → "Meal takeaway". */
export function primaryTypeLabel(types: string[] | undefined): string | null {
  const t = types?.find((x) => !GENERIC_TYPES.has(x));
  if (!t) return null;
  const words = t.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isFeedWorthy(place: GooglePlace): boolean {
  if (!place?.place_id || !place.geometry?.location) return false;
  if (place.types?.some((t) => EXCLUDED_PLACE_TYPES.includes(t))) return false;
  if (place.business_status && place.business_status !== 'OPERATIONAL')
    return false;
  return true;
}

export interface MapOptions {
  baseUrl: string;
  maxPhotos: number;
  categoryLabel?: string | null;
  origin?: { lat: number; lng: number } | null;
}

/**
 * Google place → PlaceSummary with the per-user fields defaulted
 * (likesCount 0, isLiked/isFavorite false); PlacesService.enrich fills them.
 */
export function toPlaceSummary(
  place: GooglePlace,
  opts: MapOptions,
): PlaceSummary {
  const loc = place.geometry?.location ?? { lat: 0, lng: 0 };
  return {
    placeId: place.place_id,
    name: place.name ?? '',
    rating: place.rating ?? null,
    userRatingsTotal: place.user_ratings_total ?? null,
    address: place.vicinity ?? place.formatted_address ?? null,
    city: cityOf(place),
    lat: loc.lat,
    lng: loc.lng,
    categoryLabel: opts.categoryLabel ?? primaryTypeLabel(place.types),
    priceLevel: place.price_level ?? null,
    photos: mapPhotos(place.photos, opts.baseUrl, opts.maxPhotos),
    openingHours: mapOpeningHours(place),
    utcOffsetMinutes: mapUtcOffset(place),
    distanceM: opts.origin
      ? Math.round(
          haversineMetres(opts.origin.lat, opts.origin.lng, loc.lat, loc.lng),
        )
      : null,
    likesCount: 0,
    isLiked: false,
    isFavorite: false,
  };
}

export function toPostPlace(summary: PlaceSummary): PostPlace {
  const {
    placeId,
    name,
    rating,
    userRatingsTotal,
    address,
    city,
    lat,
    lng,
    categoryLabel,
    openingHours,
    utcOffsetMinutes,
  } = summary;
  return {
    placeId,
    name,
    rating,
    userRatingsTotal,
    address,
    city,
    lat,
    lng,
    categoryLabel,
    openingHours,
    utcOffsetMinutes,
  };
}
