/**
 * The parts of the LEGACY Places / Geocoding web service JSON we use
 * (maps.googleapis.com/maps/api/place/…). Only GooglePlacesClient and
 * place-mapper.ts should depend on these.
 */
export interface GooglePhoto {
  photo_reference: string;
  width?: number;
  height?: number;
  html_attributions?: string[];
}

export interface GoogleOpeningHours {
  open_now?: boolean;
  periods?: {
    open: { day: number; time: string };
    close?: { day: number; time: string };
  }[];
  weekday_text?: string[];
}

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GooglePlace {
  place_id: string;
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: { location?: { lat: number; lng: number } };
  types?: string[];
  price_level?: number;
  photos?: GooglePhoto[];
  opening_hours?: GoogleOpeningHours;
  utc_offset?: number;
  utc_offset_minutes?: number;
  formatted_phone_number?: string;
  website?: string;
  url?: string;
  business_status?: string;
}

/** One page of Nearby Search or Text Search results. */
export interface GooglePage {
  results: GooglePlace[];
  nextPageToken: string | null;
}

export interface GooglePrediction {
  place_id: string;
  description?: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
}

export interface GoogleGeocodeResult {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  types?: string[];
}

export interface GooglePhotoBytes {
  bytes: Buffer;
  contentType: string;
}
