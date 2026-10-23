/**
 * Shared shapes from docs/API_CONTRACT.md ("Shared shapes"). New endpoints
 * return exactly these; keep them in sync with the contract.
 */
import { PublicUser } from '../utils/user-sanitizer';

export { PublicUser };

export type Photo = {
  ref: string;
  url: string;
  width: number | null;
  height: number | null;
  attribution?: string;
};

export type OpeningHours = {
  // Google legacy Places format: day 0 = Sunday, time "HHMM" local to the place
  periods: {
    open: { day: number; time: string };
    close?: { day: number; time: string };
  }[];
  weekdayText: string[];
} | null;

export type PlaceSummary = {
  placeId: string;
  name: string;
  rating: number | null;
  userRatingsTotal: number | null;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  categoryLabel: string | null;
  priceLevel: number | null;
  photos: Photo[];
  openingHours: OpeningHours;
  utcOffsetMinutes: number | null;
  distanceM: number | null;
  likesCount: number;
  isLiked: boolean;
  isFavorite: boolean;
};

export type PlaceDetails = PlaceSummary & {
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  crunchiiReviewsCount: number;
};

export type PostPlace = Pick<
  PlaceSummary,
  | 'placeId'
  | 'name'
  | 'rating'
  | 'userRatingsTotal'
  | 'address'
  | 'city'
  | 'lat'
  | 'lng'
  | 'categoryLabel'
  | 'openingHours'
  | 'utcOffsetMinutes'
>;

export type Media = {
  url: string;
  type: 'image' | 'video';
  thumbnailUrl?: string | null;
};

export type ContractPost = {
  postId: string;
  user: PublicUser;
  place: PostPlace | null;
  description: string;
  rating: number | null;
  media: Media[];
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
  distanceM: number | null;
};

export type Ad = {
  adId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  linkUrl: string | null;
  title: string | null;
};

export type FeedItem =
  | { kind: 'place'; id: string; place: PlaceSummary }
  | { kind: 'post'; id: string; post: ContractPost };
