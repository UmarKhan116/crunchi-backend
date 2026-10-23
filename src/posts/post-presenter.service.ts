import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Post } from '../entities/post.entity';
import { Like } from '../entities/like.entity';
import { ContractPost, Media, PostPlace } from '../common/contract/types';
import { buildMediaUrl } from '../common/utils/public-url';
import { toPublicUser } from '../common/utils/user-sanitizer';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']);

/** Relations `present` needs on each post. */
export const POST_PRESENTER_RELATIONS = ['user', 'restaurant', 'category'];

export interface PresentOptions {
  baseUrl: string;
  userId?: number | null;
  /** Distances from the caller, when the query computed them. */
  distanceById?: Map<number, number | null>;
  /** Fresher place data (e.g. from the Place Details cache) by Google place id. */
  placeById?: Map<string, PostPlace>;
}

const toNumberOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

/**
 * Builds the contract `Post` shape (PublicUser only, absolute media URLs,
 * isLiked for the caller). Shared by /feed and /places/:id/posts.
 */
@Injectable()
export class PostPresenter {
  constructor(
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
  ) {}

  async present(posts: Post[], opts: PresentOptions): Promise<ContractPost[]> {
    if (!posts.length) return [];
    const liked = new Set<number>();
    if (opts.userId) {
      const likes = await this.likeRepository.find({
        select: { post_id: true },
        where: { user_id: opts.userId, post_id: In(posts.map((p) => p.id)) },
      });
      likes.forEach((l) => liked.add(l.post_id));
    }
    return posts.map((post) => ({
      postId: String(post.id),
      user: toPublicUser(post.user, opts.baseUrl),
      place: this.place(post, opts.placeById),
      description: post.description ?? '',
      rating: toNumberOrNull(post.rating),
      media: this.media(post.images, opts.baseUrl),
      likesCount: post.likes_count ?? 0,
      commentsCount: post.comments_count ?? 0,
      isLiked: liked.has(post.id),
      createdAt: new Date(post.created_at).toISOString(),
      distanceM: opts.distanceById?.get(post.id) ?? null,
    }));
  }

  private media(images: string[] | null, baseUrl: string): Media[] {
    return (Array.isArray(images) ? images : [])
      .filter((name) => typeof name === 'string' && name)
      .map((name) => {
        const ext = name.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
        return {
          url: buildMediaUrl(baseUrl, '', name),
          type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image',
          thumbnailUrl: null,
        };
      });
  }

  private place(
    post: Post,
    placeById?: Map<string, PostPlace>,
  ): PostPlace | null {
    const r = post.restaurant;
    if (!r?.google_place_id) return null;
    const fresh = placeById?.get(r.google_place_id);
    if (fresh) return fresh;
    const lat = toNumberOrNull(r.latitude ?? post.latitude);
    const lng = toNumberOrNull(r.longitude ?? post.longitude);
    return {
      placeId: r.google_place_id,
      name: r.name ?? post.location ?? '',
      rating: toNumberOrNull(r.google_rating),
      userRatingsTotal: null,
      address: r.address ?? null,
      city: null,
      lat: lat ?? 0,
      lng: lng ?? 0,
      categoryLabel: post.category?.name ?? null,
      openingHours: r.opening_periods ?? null,
      utcOffsetMinutes: r.utc_offset_minutes ?? null,
    };
  }
}
