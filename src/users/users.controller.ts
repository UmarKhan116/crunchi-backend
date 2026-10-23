import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CursorQueryDto, pageLimit } from '../common/dto/cursor-query.dto';
import { ok } from '../common/http/api-envelope';
import { BaseUrl } from '../common/utils/public-url';
import { parseId } from '../common/utils/sql';
import {
  SetFollowingDto,
  UpdateMeDto,
  UserSearchQueryDto,
} from './dto/users.dto';
import { UsersService } from './users.service';
import { AccountService } from './account.service';

function userId(value: string): number {
  const id = parseId(value);
  if (!id) throw new NotFoundException('User not found');
  return id;
}

/** Users and profile (Milestone 2). `users/search` is declared before `users/:userId`. */
@ApiTags('Users')
@Controller('api')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly account: AccountService,
  ) {}

  @Get('users/search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Search users by userName or fullName',
    description:
      'data: { items: (PublicUser & { followersCount, postsCount, isFollowing })[]; nextCursor }',
  })
  @ApiResponse({ status: 200, description: 'Users' })
  async search(
    @CurrentUser('id') viewerId: number,
    @Query() q: UserSearchQueryDto,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.users.search(
        viewerId,
        q.q,
        q.cursor,
        pageLimit(q.limit),
        baseUrl,
      ),
    );
  }

  @Get('users/:userId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'A user profile (auth optional)',
    description:
      'data: PublicUser & { bio, followersCount, followingCount, postsCount, isFollowing, isMe }',
  })
  @ApiParam({ name: 'userId' })
  @ApiResponse({ status: 200, description: 'Profile' })
  @ApiResponse({ status: 404, description: 'Unknown or deactivated user' })
  async profile(
    @Param('userId') id: string,
    @CurrentUser('id') viewerId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(await this.users.profile(userId(id), viewerId, baseUrl));
  }

  @Get('users/:userId/posts')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "A user's posts, newest first (auth optional)",
    description: 'data: { items: Post[]; nextCursor }',
  })
  @ApiParam({ name: 'userId' })
  async posts(
    @Param('userId') id: string,
    @Query() q: CursorQueryDto,
    @CurrentUser('id') viewerId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.users.posts(
        userId(id),
        viewerId,
        q.cursor,
        pageLimit(q.limit),
        baseUrl,
      ),
    );
  }

  @Get('users/:userId/favorites')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "A user's saved restaurants (auth optional)",
    description:
      'Built from restaurants + the place cache. data: { items: PlaceSummary[]; nextCursor }',
  })
  @ApiParam({ name: 'userId' })
  async favorites(
    @Param('userId') id: string,
    @Query() q: CursorQueryDto,
    @CurrentUser('id') viewerId: number | undefined,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.users.favorites(
        userId(id),
        viewerId,
        q.cursor,
        pageLimit(q.limit),
        baseUrl,
      ),
    );
  }

  @Put('users/:userId/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Follow or unfollow (idempotent)',
    description: 'Body { following }. data: { following, followersCount }',
  })
  @ApiParam({ name: 'userId' })
  async follow(
    @Param('userId') id: string,
    @CurrentUser('id') viewerId: number,
    @Body() body: SetFollowingDto,
  ) {
    return ok(
      await this.users.setFollowing(viewerId, userId(id), body.following),
    );
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update my profile',
    description:
      '{ fullName?, userName?, bio? (≤160), avatarUrl? }. data: PublicUser & { bio }. 409 if the userName is taken',
  })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 409, description: 'userName taken' })
  async updateMe(
    @CurrentUser('id') viewerId: number,
    @Body() body: UpdateMeDto,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(await this.account.update(viewerId, body, baseUrl));
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete my account',
    description:
      'Cascades to posts, likes, comments, favourites, follows, tokens and notifications, and removes my uploads. data: { deleted: true }',
  })
  @ApiResponse({ status: 200, description: 'Deleted' })
  async deleteMe(@CurrentUser('id') viewerId: number) {
    await this.account.remove(viewerId);
    return ok({ deleted: true });
  }
}
