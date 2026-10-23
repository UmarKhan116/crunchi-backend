import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { LikePostDto } from './dto/like-post.dto';
import { CommentPostDto } from './dto/comment-post.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Posts')
@Controller('api')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('post-save')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new post' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Post created successfully' })
  async create(
    @Body(ValidationPipe) createPostDto: CreatePostDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.postsService.create(createPostDto, userId);
  }

  @Get('get_post/:id')
  @ApiOperation({ summary: 'Get post by ID' })
  @ApiResponse({ status: 200, description: 'Post retrieved successfully' })
  async getPost(@Param('id') id: string) {
    return this.postsService.getPost(id);
  }

  @Post('post-update/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update post by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Post updated successfully' })
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updatePostDto: UpdatePostDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.postsService.update(id, updatePostDto, userId);
  }

  @Delete('post-delete/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete post by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Post deleted successfully' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.postsService.remove(id, userId);
  }

  @Post('index-distance')
  @ApiOperation({
    summary: 'Get posts by location distance (legacy)',
    description:
      'Body: latitude, longitude, radius (km, default 40), page or offset, ' +
      'limit (default 50, max 100). Paginated in SQL, newest first.',
  })
  @ApiResponse({ status: 200, description: 'Posts retrieved successfully' })
  async getPostsByLocation(@Body() locationDto: any) {
    return this.postsService.getPostsByLocation(locationDto);
  }

  @Post('post_like')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Like/unlike a post' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Post liked/unliked successfully' })
  async like(
    @Body(ValidationPipe) likePostDto: LikePostDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.postsService.like(likePostDto, userId);
  }

  @Post('comment-post')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Comment on a post' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  async comment(
    @Body(ValidationPipe) commentPostDto: CommentPostDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.postsService.comment(commentPostDto, userId);
  }

  @Get('likes_mypost')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user liked posts' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Liked posts retrieved successfully',
  })
  async getLikedPosts(@CurrentUser('id') userId: number) {
    return this.postsService.getLikedPosts(userId);
  }

  @Get('favorite-post')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user favorite posts' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Favorite posts retrieved successfully',
  })
  async getFavoritePosts(@CurrentUser('id') userId: number) {
    return this.postsService.getFavoritePosts(userId);
  }
}
