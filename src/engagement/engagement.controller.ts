import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/http/api-envelope';
import { parseId } from '../common/utils/sql';
import { SetFavoriteDto, SetLikedDto } from './dto/set-state.dto';
import { PostLikesService } from './post-likes.service';
import { PlaceSavesService } from './place-saves.service';

/**
 * Set-state endpoints (WS6): calling one twice with the same body is a
 * no-op, so the app can replay them after being offline.
 */
@ApiTags('Posts')
@Controller('api')
export class EngagementController {
  constructor(
    private readonly postLikes: PostLikesService,
    private readonly placeSaves: PlaceSavesService,
  ) {}

  @Put('posts/:postId/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Like or unlike a post (idempotent)',
    description: 'Body { liked }. data: { liked, likesCount }',
  })
  @ApiParam({ name: 'postId' })
  @ApiResponse({ status: 200, description: 'State set' })
  @ApiResponse({ status: 404, description: 'Unknown or hidden post' })
  async likePost(
    @CurrentUser('id') userId: number,
    @Param('postId') postId: string,
    @Body() body: SetLikedDto,
  ) {
    const id = parseId(postId);
    if (!id) throw new NotFoundException('Post not found');
    return ok(await this.postLikes.setLiked(userId, id, body.liked));
  }

  @Put('places/:placeId/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiTags('Places')
  @ApiOperation({
    summary: 'Like (save) a Google place (idempotent)',
    description:
      'Same saved state as /favorite. Body { liked }. data: { liked, likesCount }',
  })
  @ApiParam({ name: 'placeId', description: 'Google place_id' })
  @ApiResponse({ status: 200, description: 'State set' })
  async likePlace(
    @CurrentUser('id') userId: number,
    @Param('placeId') placeId: string,
    @Body() body: SetLikedDto,
  ) {
    const { saved, likesCount } = await this.placeSaves.setSaved(
      userId,
      placeId,
      body.liked,
    );
    return ok({ liked: saved, likesCount });
  }

  @Put('places/:placeId/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiTags('Places')
  @ApiOperation({
    summary: 'Save a Google place to favourites (idempotent)',
    description:
      'Same saved state as /like. The restaurant row is filled from the place cache. Body { favorite }. data: { favorite }',
  })
  @ApiParam({ name: 'placeId', description: 'Google place_id' })
  @ApiResponse({ status: 200, description: 'State set' })
  async favoritePlace(
    @CurrentUser('id') userId: number,
    @Param('placeId') placeId: string,
    @Body() body: SetFavoriteDto,
  ) {
    const { saved } = await this.placeSaves.setSaved(
      userId,
      placeId,
      body.favorite,
    );
    return ok({ favorite: saved });
  }
}
