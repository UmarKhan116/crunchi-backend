import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BaseUrl } from '../../common/utils/public-url';
import { ok } from '../../common/http/api-envelope';
import { FeedQueryDto } from '../dto/places-query.dto';
import { FeedService } from './feed.service';

@ApiTags('Feed')
@Controller('api')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Home feed: nearby places + Crunchii posts (auth optional)',
    description:
      'Google Nearby Search per (category, area cell), cached 60 min, deduped by placeId, ' +
      'interleaved with posts (1 post after every 2 places). Ads are not included; the app ' +
      'inserts them using adRules from /bootstrap. ' +
      'data: { items: FeedItem[]; nextCursor: string | null }',
  })
  @ApiResponse({ status: 200, description: 'A page of the feed' })
  @ApiResponse({ status: 400, description: 'Invalid query or cursor' })
  async feed(
    @Query() q: FeedQueryDto,
    @CurrentUser('id') userId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.feedService.feed(
        {
          lat: q.lat,
          lng: q.lng,
          radiusM: q.radiusM,
          categories: q.categories,
          openNow: q.openNow,
          cursor: q.cursor,
          limit: q.limit,
        },
        { userId, baseUrl },
      ),
    );
  }
}
