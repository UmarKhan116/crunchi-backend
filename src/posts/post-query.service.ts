import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Post } from '../entities/post.entity';
import { boundingBox, haversineSql } from '../common/utils/geo';

export interface NearbyPostsQuery {
  lat?: number | null;
  lng?: number | null;
  radiusM: number;
  categoryIds?: number[];
  /** Legacy index-distance also returned posts without coordinates. */
  includeUnlocated?: boolean;
  offset: number;
  limit: number;
}

export interface PostIdRow {
  id: number;
  distanceM: number | null;
}

/**
 * Distance-filtered, newest-first post queries paginated in SQL: a
 * bounding-box prefilter (idx_posts_lat_lng) then an exact haversine check.
 * Shared by POST /api/index-distance and GET /api/feed.
 */
@Injectable()
export class PostQueryService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
  ) {}

  async findNearbyIds(q: NearbyPostsQuery): Promise<PostIdRow[]> {
    const qb = this.postRepository
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .where('p.is_active = true');

    const hasLocation = Number.isFinite(q.lat) && Number.isFinite(q.lng);
    if (hasLocation) {
      const box = boundingBox(q.lat, q.lng, q.radiusM);
      const distance = haversineSql('p.latitude', 'p.longitude');
      qb.addSelect(distance, 'distance_m');
      const located =
        'p.latitude BETWEEN :minLat AND :maxLat AND ' +
        'p.longitude BETWEEN :minLng AND :maxLng AND ' +
        `${distance} <= :radiusM`;
      qb.andWhere(
        q.includeUnlocated
          ? `((${located}) OR p.latitude IS NULL OR p.longitude IS NULL)`
          : `(${located})`,
        { ...box, lat: q.lat, lng: q.lng, radiusM: q.radiusM },
      );
    }
    if (q.categoryIds?.length) {
      qb.andWhere('p.category_id IN (:...categoryIds)', {
        categoryIds: q.categoryIds,
      });
    }

    const rows = await qb
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .offset(q.offset)
      .limit(q.limit)
      .getRawMany();

    return rows.map((r) => ({
      id: Number(r.id),
      distanceM:
        r.distance_m === null || r.distance_m === undefined
          ? null
          : Math.round(Number(r.distance_m)),
    }));
  }

  /** Active posts for a Google place id, newest first. */
  async findIdsByPlaceId(
    placeId: string,
    offset: number,
    limit: number,
  ): Promise<number[]> {
    const rows = await this.postRepository
      .createQueryBuilder('p')
      .innerJoin('p.restaurant', 'r')
      .select('p.id', 'id')
      .where('p.is_active = true')
      .andWhere('r.google_place_id = :placeId', { placeId })
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany();
    return rows.map((r) => Number(r.id));
  }

  async countByPlaceId(placeId: string): Promise<number> {
    return this.postRepository
      .createQueryBuilder('p')
      .innerJoin('p.restaurant', 'r')
      .where('p.is_active = true')
      .andWhere('r.google_place_id = :placeId', { placeId })
      .getCount();
  }

  /** Loads posts by id with relations, keeping the order of `ids`. */
  async loadInOrder(ids: number[], relations: string[]): Promise<Post[]> {
    if (!ids.length) return [];
    const posts = await this.postRepository.find({
      where: { id: In(ids) },
      relations,
    });
    const byId = new Map(posts.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  /**
   * Recomputes the denormalised counters from the source tables in one
   * statement, so concurrent likes/comments never lose an update.
   */
  async refreshCounts(postId: number): Promise<{
    likesCount: number;
    commentsCount: number;
  }> {
    const rows = await this.postRepository.query(
      `UPDATE posts
          SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id = $1),
              comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = $1)
        WHERE id = $1
        RETURNING likes_count, comments_count`,
      [postId],
    );
    // pg returns [rows, rowCount] for UPDATE ... RETURNING through TypeORM.
    const row = Array.isArray(rows?.[0]) ? rows[0][0] : rows?.[0];
    return {
      likesCount: Number(row?.likes_count ?? 0),
      commentsCount: Number(row?.comments_count ?? 0),
    };
  }
}
