import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
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
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CursorQueryDto, pageLimit } from '../common/dto/cursor-query.dto';
import { BaseUrl } from '../common/utils/public-url';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/http/api-envelope';
import { parseId } from '../common/utils/sql';
import { SetFavoriteDto, SetLikedDto } from './dto/set-state.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsService } from './comments.service';
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
    private readonly comments: CommentsService,
  ) {}

  private postId(value: string): number {
    const id = parseId(value);
    if (!id) throw new NotFoundException('Post not found');
    return id;
  }

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
    return ok(
      await this.postLikes.setLiked(userId, this.postId(postId), body.liked),
    );
  }

  // ------------------------------------------------------------ comments

  @Get('posts/:postId/comments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Comments on a post, oldest first (auth optional)',
    description: 'data: { items: Comment[]; nextCursor }',
  })
  @ApiParam({ name: 'postId' })
  @ApiResponse({ status: 200, description: 'Comments' })
  @ApiResponse({ status: 404, description: 'Unknown or hidden post' })
  async listComments(
    @Param('postId') postId: string,
    @Query() q: CursorQueryDto,
    @CurrentUser('id') userId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.comments.list(
        this.postId(postId),
        userId,
        q.cursor,
        pageLimit(q.limit),
        baseUrl,
      ),
    );
  }

  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Comment on a post',
    description: 'Body { text } (1–500 chars). data: Comment',
  })
  @ApiParam({ name: 'postId' })
  @ApiResponse({ status: 201, description: 'Comment created' })
  async createComment(
    @Param('postId') postId: string,
    @Body() body: CreateCommentDto,
    @CurrentUser('id') userId: number,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.comments.create(
        this.postId(postId),
        userId,
        body.text,
        baseUrl,
      ),
    );
  }

  @Delete('comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a comment (author or post owner)',
    description: 'data: { ok: true, commentsCount }',
  })
  @ApiParam({ name: 'commentId' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 403, description: 'Not yours' })
  @ApiResponse({ status: 404, description: 'Unknown comment' })
  async deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: number,
  ) {
    const id = parseId(commentId);
    if (!id) throw new NotFoundException('Comment not found');
    return ok(await this.comments.remove(id, userId));
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
