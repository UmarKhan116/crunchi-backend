import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BaseUrl } from '../common/utils/public-url';
import { ok } from '../common/http/api-envelope';
import { PlacesService } from './places.service';
import { PlacePhotoService } from './place-photo.service';
import {
  AutocompleteQueryDto,
  PhotoQueryDto,
  PlaceDetailsQueryDto,
  PlacePostsQueryDto,
  PlaceSearchQueryDto,
  ReverseGeocodeQueryDto,
} from './dto/places-query.dto';

const PLACE_POSTS_DEFAULT_LIMIT = 20;
const PLACE_POSTS_MAX_LIMIT = 50;

/**
 * Google Places proxy. Static paths (search, autocomplete, photo) are
 * declared before `places/:placeId` so Express matches them first.
 */
@ApiTags('Places')
@Controller('api')
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly photos: PlacePhotoService,
  ) {}

  @Get('places/search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Text search for places (auth optional)',
    description:
      'Google Text Search, cached 60 min per (normalised query, area cell). ' +
      'data: { items: PlaceSummary[]; nextCursor }',
  })
  @ApiResponse({ status: 200, description: 'Places found' })
  async search(
    @Query() q: PlaceSearchQueryDto,
    @CurrentUser('id') userId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.places.search(
        {
          query: q.query,
          lat: q.lat,
          lng: q.lng,
          radiusM: q.radiusM ? Math.min(q.radiusM, 48000) : undefined,
          openNow: q.openNow,
          cursor: q.cursor,
        },
        { userId, baseUrl },
      ),
    );
  }

  @Get('places/autocomplete')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Place autocomplete (auth optional)',
    description:
      'Cached 10 min. data: { placeId, primaryText, secondaryText }[]',
  })
  @ApiResponse({ status: 200, description: 'Predictions' })
  async autocomplete(@Query() q: AutocompleteQueryDto) {
    return ok(
      await this.places.autocomplete({
        input: q.input,
        lat: q.lat,
        lng: q.lng,
        sessionToken: q.sessionToken,
      }),
    );
  }

  @Get('places/photo/:ref')
  @ApiOperation({
    summary: 'Google place photo bytes (no auth)',
    description:
      'Fetched with the server key and cached on disk for 24 h. ' +
      'w is clamped to 400, 800 or 1200.',
  })
  @ApiParam({ name: 'ref', description: 'Google photo_reference' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiResponse({ status: 200, description: 'Image bytes' })
  @ApiResponse({ status: 400, description: 'Invalid photo reference' })
  @ApiResponse({ status: 404, description: 'Unknown photo' })
  async photo(
    @Param('ref') ref: string,
    @Query() q: PhotoQueryDto,
    @Res() res: Response,
  ) {
    const photo = await this.photos.getPhoto(ref, q.w);
    res.set({
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': String(photo.bytes.length),
    });
    res.end(photo.bytes);
  }

  @Get('places/:placeId/posts')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Crunchii reviews of a place (auth optional)',
    description: 'Newest first. data: { items: Post[]; nextCursor }',
  })
  @ApiParam({ name: 'placeId', description: 'Google place_id' })
  @ApiResponse({ status: 200, description: 'Posts' })
  async placePosts(
    @Param('placeId') placeId: string,
    @Query() q: PlacePostsQueryDto,
    @CurrentUser('id') userId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    const limit = Math.min(
      q.limit ?? PLACE_POSTS_DEFAULT_LIMIT,
      PLACE_POSTS_MAX_LIMIT,
    );
    return ok(
      await this.places.placePosts(placeId, q.cursor, limit, {
        userId,
        baseUrl,
      }),
    );
  }

  @Get('places/:placeId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Place details (auth optional)',
    description:
      'Place Details with an explicit field list, cached 24 h. ' +
      'data: PlaceSummary & { phone, website, mapsUrl, photos (≤10), crunchiiReviewsCount }',
  })
  @ApiParam({ name: 'placeId', description: 'Google place_id' })
  @ApiResponse({ status: 200, description: 'Place' })
  @ApiResponse({ status: 404, description: 'Unknown place' })
  async details(
    @Param('placeId') placeId: string,
    @Query() q: PlaceDetailsQueryDto,
    @CurrentUser('id') userId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    const origin =
      q.lat !== undefined && q.lng !== undefined
        ? { lat: q.lat, lng: q.lng }
        : null;
    return ok(await this.places.details(placeId, { userId, baseUrl }, origin));
  }

  @Get('geocode/reverse')
  @ApiOperation({
    summary: 'Reverse geocode (no auth)',
    description:
      'Street label and city for the area cell, cached 24 h. data: { label, city }',
  })
  @ApiResponse({ status: 200, description: 'Location label' })
  async reverseGeocode(@Query() q: ReverseGeocodeQueryDto) {
    return ok(await this.places.reverseGeocode(q.lat, q.lng));
  }
}
