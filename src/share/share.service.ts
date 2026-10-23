import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PostReadService } from '../engagement/post-read.service';
import { PlacesService, detailsCacheKey } from '../places/places.service';
import { PlaceCacheService } from '../places/place-cache.service';
import { GooglePlace } from '../places/google/google-places.types';
import {
  cityOf,
  photoProxyUrl,
  primaryTypeLabel,
} from '../places/place-mapper';
import { buildMediaUrl } from '../common/utils/public-url';
import { parseId } from '../common/utils/sql';
import { readShareConfig } from './share-config';
import {
  SharePage,
  ratingLine,
  renderNotFoundPage,
  renderSharePage,
} from './share-html';

/** Preview images: about 1200 px wide for link unfurls. */
const OG_PHOTO_WIDTH = 1200;
const VIDEO = /\.(mp4|mov|avi|mkv|webm|m4v)(\?|$)/i;
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{4,512}$/;

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface ShareResult {
  status: 200 | 404;
  html: string;
}

/** Server-rendered share pages for /p/:postId, /r/:placeId and /u/:userId. */
@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly postRead: PostReadService,
    private readonly places: PlacesService,
    private readonly cache: PlaceCacheService,
  ) {}

  private render(page: SharePage | null): ShareResult {
    const config = readShareConfig();
    return page
      ? { status: 200, html: renderSharePage(page, config) }
      : { status: 404, html: renderNotFoundPage(config) };
  }

  private async cachedPlace(placeId: string): Promise<GooglePlace | null> {
    const payload = await this.cache.get<{ place: GooglePlace | null }>(
      detailsCacheKey(placeId),
    );
    return payload?.place ?? null;
  }

  async postPage(rawId: string, baseUrl: string): Promise<ShareResult> {
    const id = parseId(rawId);
    const post = id ? await this.postRead.load(id) : null;
    if (!post) return this.render(null);

    const r = post.restaurant;
    const place = r?.google_place_id
      ? await this.cachedPlace(r.google_place_id)
      : null;
    const image = (post.images ?? []).find(
      (f) => typeof f === 'string' && f && !VIDEO.test(f),
    );
    const photoRef =
      place?.photos?.[0]?.photo_reference ?? r?.google_photo_reference;
    const author =
      post.user.full_name || post.user.user_name || 'A Crunchii user';
    return this.render({
      path: `/p/${post.id}`,
      title: r?.name || post.location || `${author} on Crunchii`,
      description: ratingLine(
        num(post.rating),
        place ? primaryTypeLabel(place.types) : post.category?.name,
        place
          ? cityOf(place)
          : r?.address
            ? cityOf({ vicinity: r.address } as GooglePlace)
            : null,
      ),
      imageUrl: image
        ? buildMediaUrl(baseUrl, '', image)
        : photoRef
          ? photoProxyUrl(baseUrl, photoRef, OG_PHOTO_WIDTH)
          : null,
      rating: num(post.rating),
      byline: post.user.user_name
        ? `Review by @${post.user.user_name}`
        : `Review by ${author}`,
      text: post.description,
    });
  }

  async placePage(placeId: string, baseUrl: string): Promise<ShareResult> {
    if (!PLACE_ID_PATTERN.test(placeId ?? '')) return this.render(null);
    let place = await this.cachedPlace(placeId);
    if (!place) {
      const [row] = await this.dataSource.query(
        `SELECT name, address, google_rating, google_photo_reference
           FROM restaurants WHERE google_place_id = $1 ORDER BY id LIMIT 1`,
        [placeId],
      );
      if (row && row.name && row.name !== 'Unknown Restaurant') {
        return this.render({
          path: `/r/${placeId}`,
          title: row.name,
          description: ratingLine(
            num(row.google_rating),
            null,
            row.address
              ? cityOf({ vicinity: row.address } as GooglePlace)
              : null,
          ),
          imageUrl: row.google_photo_reference
            ? photoProxyUrl(baseUrl, row.google_photo_reference, OG_PHOTO_WIDTH)
            : null,
          rating: num(row.google_rating),
          byline: row.address,
        });
      }
      try {
        // Read-through: one Place Details call per place per 24 h.
        place = await this.places.detailsRaw(placeId);
      } catch (error) {
        this.logger.warn(`share page for ${placeId}: ${error?.message}`);
        place = null;
      }
    }
    if (!place) return this.render(null);
    const ref = place.photos?.[0]?.photo_reference;
    return this.render({
      path: `/r/${placeId}`,
      title: place.name || 'A restaurant on Crunchii',
      description: ratingLine(
        place.rating ?? null,
        primaryTypeLabel(place.types),
        cityOf(place),
      ),
      imageUrl: ref ? photoProxyUrl(baseUrl, ref, OG_PHOTO_WIDTH) : null,
      rating: place.rating ?? null,
      byline: place.formatted_address ?? place.vicinity ?? null,
    });
  }

  async userPage(rawId: string, baseUrl: string): Promise<ShareResult> {
    const id = parseId(rawId);
    const [u] = id
      ? await this.dataSource.query(
          `SELECT u.id, u.full_name, u.user_name, u.profile_picture, u.bio,
                  (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id AND p.is_active) AS posts_count,
                  (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS followers_count,
                  (SELECT p.images FROM posts p WHERE p.user_id = u.id AND p.is_active
                    ORDER BY p.created_at DESC LIMIT 1) AS latest_images
             FROM users u WHERE u.id = $1 AND u.is_active`,
          [id],
        )
      : [];
    if (!u) return this.render(null);
    const name = u.full_name || u.user_name || 'Crunchii user';
    const latest = (Array.isArray(u.latest_images) ? u.latest_images : []).find(
      (f) => typeof f === 'string' && f && !VIDEO.test(f),
    );
    const plural = (n: number, word: string) =>
      `${n} ${word}${n === 1 ? '' : 's'}`;
    return this.render({
      path: `/u/${u.id}`,
      title: u.user_name ? `${name} (@${u.user_name})` : name,
      description: [
        plural(u.posts_count, 'review'),
        plural(u.followers_count, 'follower'),
        'on Crunchii',
      ].join(' · '),
      imageUrl:
        buildMediaUrl(baseUrl, 'user', u.profile_picture) ??
        (latest ? buildMediaUrl(baseUrl, '', latest) : null),
      text: u.bio,
    });
  }
}
