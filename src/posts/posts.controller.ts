import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  ValidationPipe,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { LikePostDto } from './dto/like-post.dto';
import { CommentPostDto } from './dto/comment-post.dto';

@ApiTags('Posts')
@Controller('api')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly jwtService: JwtService,
  ) {}

  private extractUserIdFromToken(authorization: string): number {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      const token = authorization.split(' ')[1];
      const decoded = this.jwtService.verify(token);

      if (!decoded.id) {
        throw new UnauthorizedException('Invalid token payload');
      }

      return decoded.id;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @Post('post-save')
  @ApiOperation({ summary: 'Create a new post' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Post created successfully' })
  async create(
    @Body(ValidationPipe) createPostDto: CreatePostDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.postsService.create(createPostDto, userId);
  }

  @Get('get_post/:id')
  @ApiOperation({ summary: 'Get post by ID' })
  @ApiResponse({ status: 200, description: 'Post retrieved successfully' })
  async getPost(@Param('id') id: string) {
    return this.postsService.getPost(id);
  }

  @Post('post-update/:id')
  @ApiOperation({ summary: 'Update post by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Post updated successfully' })
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updatePostDto: UpdatePostDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.postsService.update(id, updatePostDto, userId);
  }

  @Delete('post-delete/:id')
  @ApiOperation({ summary: 'Delete post by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Post deleted successfully' })
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.postsService.remove(id, userId);
  }

  @Post('index-distance')
  @ApiOperation({ summary: 'Get posts by location distance' })
  @ApiResponse({ status: 200, description: 'Posts retrieved successfully' })
  async getPostsByLocation(@Body() locationDto: any) {
    return this.postsService.getPostsByLocation(locationDto);
  }

  @Post('post_like')
  @ApiOperation({ summary: 'Like/unlike a post' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Post liked/unliked successfully' })
  async like(
    @Body(ValidationPipe) likePostDto: LikePostDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.postsService.like(likePostDto, userId);
  }

  @Post('comment-post')
  @ApiOperation({ summary: 'Comment on a post' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  async comment(
    @Body(ValidationPipe) commentPostDto: CommentPostDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.postsService.comment(commentPostDto, userId);
  }

  @Get('likes_mypost')
  @ApiOperation({ summary: 'Get user liked posts' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Liked posts retrieved successfully',
  })
  async getLikedPosts(@Headers('authorization') authorization: string) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.postsService.getLikedPosts(userId);
  }

  @Get('favorite-post')
  @ApiOperation({ summary: 'Get user favorite posts' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Favorite posts retrieved successfully',
  })
  async getFavoritePosts(@Headers('authorization') authorization: string) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.postsService.getFavoritePosts(userId);
  }
}
