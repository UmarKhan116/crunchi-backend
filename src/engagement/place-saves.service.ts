import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PlacesService, detailsCacheKey } from '../places/places.service';
import { PlaceCacheService } from '../places/place-cache.service';
import { GooglePlace } from '../places/google/google-places.types';
import { mapOpeningHours, mapUtcOffset } from '../places/place-mapper';

const UNKNOWN_NAME = 'Unknown Restaurant';

/**
 * PUT /api/places/:placeId/like and /favorite. A place like and a favourite
 * are one saved state (the legacy googlelike and favoriteplace both write
 * the favorites table), so both endpoints call setSaved.
 */
@Injectable()
export class PlaceSavesService {
  private readonly logger = new Logger(PlaceSavesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly places: PlacesService,
    private readonly cache: PlaceCacheService,
  ) {}

  async setSaved(
    userId: number,
    placeId: string,
    saved: boolean,
  ): Promise<{ saved: boolean; likesCount: number }> {
    this.places.assertPlaceId(placeId);

    if (saved) {
      const place = await this.placeData(placeId);
      await this.dataSource.transaction(async (em) => {
        // One writer per place id, so two first saves can't create two
        // restaurant rows.
        await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `place:${placeId}`,
        ]);
        const restaurantId = await this.upsertRestaurant(em, placeId, place);
        // Restaurants can be duplicated per place id in old data; a
        // favourite on any of them already counts as saved.
        await em.query(
          `INSERT INTO favorites (user_id, restaurant_id)
           SELECT $1, $2
            WHERE NOT EXISTS (
              SELECT 1 FROM favorites f
                JOIN restaurants r ON r.id = f.restaurant_id
               WHERE f.user_id = $1 AND r.google_place_id = $3)
           ON CONFLICT (user_id, restaurant_id) DO NOTHING`,
          [userId, restaurantId, placeId],
        );
      });
    } else {
      await this.dataSource.query(
        `DELETE FROM favorites f
          USING restaurants r
          WHERE f.restaurant_id = r.id AND r.google_place_id = $2 AND f.user_id = $1`,
        [userId, placeId],
      );
    }

    // likesCount = number of users who saved the place.
    const [{ n }] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT f.user_id)::int AS n
         FROM favorites f JOIN restaurants r ON r.id = f.restaurant_id
        WHERE r.google_place_id = $1`,
      [placeId],
    );
    return { saved, likesCount: n };
  }

  /**
   * Google data for the restaurant row: the details cache first; only a
   * place we have never seen costs a Place Details call (then cached 24 h).
   * `undefined` = unknown right now (Google failed), so the save still
   * goes through with a placeholder row.
   */
  private async placeData(
    placeId: string,
  ): Promise<GooglePlace | null | undefined> {
    const cached = await this.cache.get<{ place: GooglePlace | null }>(
      detailsCacheKey(placeId),
    );
    if (cached?.place) return cached.place;
    const [known] = await this.dataSource.query(
      `SELECT 1 FROM restaurants WHERE google_place_id = $1 LIMIT 1`,
      [placeId],
    );
    if (known) return undefined;
    try {
      const place = await this.places.detailsRaw(placeId);
      if (!place) throw new NotFoundException('Place not found');
      return place;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.warn(`details for ${placeId} unavailable: ${error?.message}`);
      return undefined;
    }
  }

  /** Inserts or refreshes the canonical (lowest id) restaurant row. */
  private async upsertRestaurant(
    em: EntityManager,
    placeId: string,
    place: GooglePlace | null | undefined,
  ): Promise<number> {
    const loc = place?.geometry?.location;
    const hours = place ? mapOpeningHours(place) : null;
    const values = [
      placeId,
      place?.name || null,
      place?.formatted_address ?? place?.vicinity ?? null,
      loc?.lat ?? null,
      loc?.lng ?? null,
      typeof place?.rating === 'number' ? place.rating : null,
      place?.photos?.[0]?.photo_reference ?? null,
      place?.photos?.length
        ? JSON.stringify(
            place.photos.map((p) => p.photo_reference).filter(Boolean),
          )
        : null,
      typeof place?.price_level === 'number' ? String(place.price_level) : null,
      hours ? JSON.stringify(hours) : null,
      place ? mapUtcOffset(place) : null,
    ];

    const [existing] = await em.query(
      `SELECT id FROM restaurants WHERE google_place_id = $1 ORDER BY id LIMIT 1`,
      [placeId],
    );
    if (existing) {
      if (place) {
        await em.query(
          `UPDATE restaurants SET
              name = COALESCE($2, name),
              address = COALESCE($3, address),
              latitude = COALESCE($4, latitude),
              longitude = COALESCE($5, longitude),
              google_rating = COALESCE($6, google_rating),
              google_photo_reference = COALESCE($7, google_photo_reference),
              google_photos = COALESCE($8::json, google_photos),
              price_level = COALESCE($9, price_level),
              opening_periods = COALESCE($10::jsonb, opening_periods),
              utc_offset_minutes = COALESCE($11, utc_offset_minutes),
              hours_updated_at = CASE WHEN $10::jsonb IS NOT NULL OR $11::int IS NOT NULL
                                      THEN now() ELSE hours_updated_at END,
              updated_at = now()
            WHERE id = $12 AND google_place_id = $1`,
          [...values, existing.id],
        );
      }
      return existing.id;
    }

    const [row] = await em.query(
      `INSERT INTO restaurants
         (google_place_id, name, address, latitude, longitude, google_rating,
          google_photo_reference, google_photos, price_level, opening_periods,
          utc_offset_minutes, hours_updated_at)
       VALUES ($1, COALESCE($2, '${UNKNOWN_NAME}'), $3, $4, $5, $6, $7, $8::json, $9,
               $10::jsonb, $11, CASE WHEN $10::jsonb IS NULL THEN NULL ELSE now() END)
       RETURNING id`,
      values,
    );
    return row.id;
  }
}
