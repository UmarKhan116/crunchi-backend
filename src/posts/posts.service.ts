import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { LikePostDto } from './dto/like-post.dto';
import { CommentPostDto } from './dto/comment-post.dto';
import { Post } from '../entities/post.entity';
import { Like } from '../entities/like.entity';
import { Comment } from '../entities/comment.entity';
import { User } from '../entities/user.entity';
import { Category } from '../entities/category.entity';
import { Restaurant } from '../entities/restaurant.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { toSafeUser } from '../common/utils/user-sanitizer';
import { PostQueryService } from './post-query.service';

/** index-distance pagination when the (legacy) client sends none. */
const INDEX_DISTANCE_DEFAULT_LIMIT = 50;
const INDEX_DISTANCE_MAX_LIMIT = 100;

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly postQuery: PostQueryService,
  ) {}

  async create(createPostDto: CreatePostDto, userId?: number) {
    try {
      // Validate category exists
      const category = await this.categoryRepository.findOne({
        where: { id: createPostDto.category_id },
      });

      if (!category) {
        return {
          success: false,
          message: 'Category not found',
        };
      }

      // Handle restaurant if provided
      let restaurantId = null;
      if (createPostDto.restaurant_id) {
        // Check if restaurant exists, if not create it
        let restaurant = await this.restaurantRepository.findOne({
          where: { google_place_id: createPostDto.restaurant_id },
        });

        if (!restaurant && createPostDto.restaurant) {
          // Create new restaurant entry
          restaurant = this.restaurantRepository.create({
            google_place_id: createPostDto.restaurant_id,
            name: createPostDto.restaurant,
            latitude: createPostDto.latitude,
            longitude: createPostDto.longitude,
          });
          await this.restaurantRepository.save(restaurant);
        }

        restaurantId = restaurant?.id || null;
      }

      // Create post
      const post = this.postRepository.create({
        description: createPostDto.description,
        images: createPostDto.images || [],
        location: createPostDto.location || null,
        user_id: userId || createPostDto.user_id,
        category_id: createPostDto.category_id,
        restaurant_id: restaurantId,
        rating: createPostDto.rating || null,
        latitude: createPostDto.latitude || null,
        longitude: createPostDto.longitude || null,
      });

      const savedPost = await this.postRepository.save(post);

      return {
        success: true,
        message: 'Post created successfully',
        post: savedPost,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create post: ' + error.message,
      };
    }
  }

  async getPost(id: string) {
    try {
      const post = await this.postRepository.findOne({
        where: { id: parseInt(id), is_active: true },
        relations: ['user', 'category', 'restaurant', 'likes', 'comments'],
      });

      if (!post) {
        return {
          success: false,
          message: 'Post not found',
        };
      }

      // Load comment users
      const comments = await this.commentRepository.find({
        where: { post_id: post.id },
        relations: ['user'],
        order: { created_at: 'DESC' },
      });

      // Load like users
      const likes = await this.likeRepository.find({
        where: { post_id: post.id },
        relations: ['user'],
      });

      // Transform post to match frontend expectations
      const file = [];
      if (post.images && Array.isArray(post.images)) {
        post.images.forEach((imageUrl: string) => {
          // Detect if it's a video or image based on extension
          const extension = imageUrl.split('.').pop()?.toLowerCase();
          const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
          const type = videoExtensions.includes(extension || '')
            ? 'video'
            : 'image';

          file.push({
            filenames: imageUrl,
            type: type,
          });
        });
      }

      // Users are other people here: only public fields (incl. `image`).
      return {
        success: true,
        message: 'Post retrieved successfully',
        post: {
          ...post,
          user: toSafeUser(post.user),
          file: file,
          review: post.description, // Frontend expects 'review', backend has 'description'
          name: post.location, // Frontend expects 'name' field
          comments: comments.map((c) => ({ ...c, user: toSafeUser(c.user) })),
          likes: likes.map((l) => ({ ...l, user: toSafeUser(l.user) })),
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get post: ' + error.message,
      };
    }
  }

  async update(id: string, updatePostDto: UpdatePostDto, userId?: number) {
    try {
      const post = await this.postRepository.findOne({
        where: { id: parseInt(id) },
      });

      if (!post) {
        return {
          success: false,
          message: 'Post not found',
        };
      }

      // Validate ownership if userId provided
      if (userId && post.user_id !== userId) {
        return {
          success: false,
          message: 'Unauthorized to update this post',
        };
      }

      // Handle restaurant update if provided
      if (updatePostDto.restaurant_id) {
        let restaurant = await this.restaurantRepository.findOne({
          where: { google_place_id: updatePostDto.restaurant_id },
        });

        if (!restaurant && updatePostDto.restaurant) {
          restaurant = this.restaurantRepository.create({
            google_place_id: updatePostDto.restaurant_id,
            name: updatePostDto.restaurant,
            latitude: updatePostDto.latitude,
            longitude: updatePostDto.longitude,
          });
          await this.restaurantRepository.save(restaurant);
        }

        post.restaurant_id = restaurant?.id || null;
      }

      // Update post fields
      if (updatePostDto.description)
        post.description = updatePostDto.description;
      if (updatePostDto.images) post.images = updatePostDto.images;
      if (updatePostDto.location) post.location = updatePostDto.location;
      if (updatePostDto.rating !== undefined)
        post.rating = updatePostDto.rating;
      if (updatePostDto.latitude !== undefined)
        post.latitude = updatePostDto.latitude;
      if (updatePostDto.longitude !== undefined)
        post.longitude = updatePostDto.longitude;
      if (updatePostDto.category_id)
        post.category_id = updatePostDto.category_id;

      const updatedPost = await this.postRepository.save(post);

      return {
        success: true,
        message: 'Post updated successfully',
        post: updatedPost,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update post: ' + error.message,
      };
    }
  }

  async remove(id: string, userId?: number) {
    try {
      const post = await this.postRepository.findOne({
        where: { id: parseInt(id) },
      });

      if (!post) {
        return {
          success: false,
          message: 'Post not found',
        };
      }

      // Validate ownership if userId provided
      if (userId && post.user_id !== userId) {
        return {
          success: false,
          message: 'Unauthorized to delete this post',
        };
      }

      // Soft delete by setting is_active to false
      post.is_active = false;
      await this.postRepository.save(post);

      return {
        success: true,
        message: 'Post deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete post: ' + error.message,
      };
    }
  }

  /**
   * POST /api/index-distance (legacy). Same response shape as before, but
   * filtered and paginated in SQL instead of loading every post.
   * Body: latitude, longitude, radius (km, default 40), page (1-based) or
   * offset, limit (default 50, max 100).
   */
  async getPostsByLocation(locationDto: any) {
    try {
      const latitude = toNumber(locationDto?.latitude);
      const longitude = toNumber(locationDto?.longitude);
      const radiusKm = toNumber(locationDto?.radius) ?? 40;
      const limit = Math.min(
        Math.max(
          Math.trunc(toNumber(locationDto?.limit) ?? INDEX_DISTANCE_DEFAULT_LIMIT),
          1,
        ),
        INDEX_DISTANCE_MAX_LIMIT,
      );
      const page = Math.max(Math.trunc(toNumber(locationDto?.page) ?? 1), 1);
      const offset = Math.max(
        Math.trunc(toNumber(locationDto?.offset) ?? (page - 1) * limit),
        0,
      );

      // One extra row tells us whether another page exists.
      const rows = await this.postQuery.findNearbyIds({
        lat: latitude,
        lng: longitude,
        radiusM: radiusKm * 1000,
        includeUnlocated: true,
        offset,
        limit: limit + 1,
      });
      const hasMore = rows.length > limit;
      const posts = await this.postQuery.loadInOrder(
        rows.slice(0, limit).map((r) => r.id),
        [
          'user',
          'category',
          'restaurant',
          'likes',
          'likes.user',
          'comments',
          'comments.user',
        ],
      );

      // Transform posts to match frontend expectations
      const transformedPosts = posts.map((post: any) => {
        // Transform images array to file array format
        const file = [];
        if (post.images && Array.isArray(post.images)) {
          post.images.forEach((imageUrl: string) => {
            // Detect if it's a video or image based on extension
            const extension = imageUrl.split('.').pop()?.toLowerCase();
            const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
            const type = videoExtensions.includes(extension || '')
              ? 'video'
              : 'image';

            file.push({
              filenames: imageUrl,
              type: type,
            });
          });
        }

        return {
          ...post,
          user: toSafeUser(post.user),
          likes: (post.likes || []).map((l) => ({
            ...l,
            user: toSafeUser(l.user),
          })),
          comments: (post.comments || []).map((c) => ({
            ...c,
            user: toSafeUser(c.user),
          })),
          file: file,
          review: post.description, // Frontend expects 'review', backend has 'description'
          name: post.location, // Frontend expects 'name' field
          restaurant: post.restaurant?.name || post.location, // Restaurant name
        };
      });

      return {
        success: true,
        message: 'Posts retrieved successfully',
        post: transformedPosts,
        pagination: { page, offset, limit, hasMore },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get posts: ' + error.message,
        post: [],
      };
    }
  }

  async like(likePostDto: LikePostDto, userId?: number) {
    try {
      const actualUserId = userId || (likePostDto as any).user_id;
      console.log(
        '📝 Like request - Post ID:',
        likePostDto.post_id,
        'User ID:',
        actualUserId,
      );

      // Check if post exists
      const post = await this.postRepository.findOne({
        where: { id: likePostDto.post_id },
      });

      if (!post) {
        console.log('❌ Post not found:', likePostDto.post_id);
        return {
          success: false,
          message: 'Post not found',
        };
      }

      // Check if user already liked the post
      const existingLike = await this.likeRepository.findOne({
        where: {
          user_id: actualUserId,
          post_id: likePostDto.post_id,
        },
      });

      if (existingLike) {
        // Unlike - remove the like
        console.log(
          '🔄 Unliking post - removing existing like ID:',
          existingLike.id,
        );
        await this.likeRepository.remove(existingLike);
        const { likesCount } = await this.postQuery.refreshCounts(post.id);
        post.likes_count = likesCount;

        console.log('✅ Post unliked - new count:', post.likes_count);
        return {
          success: true,
          message: 'Post unliked successfully',
          liked: false,
        };
      } else {
        // Like - add the like
        console.log('➕ Creating new like for post');
        const newLike = this.likeRepository.create({
          user_id: actualUserId,
          post_id: likePostDto.post_id,
        });

        const savedLike = await this.likeRepository.save(newLike);
        console.log('💾 Like saved to DB - Like ID:', savedLike.id);

        const { likesCount } = await this.postQuery.refreshCounts(post.id);
        post.likes_count = likesCount;

        // Create notification for post owner (if not liking own post)
        if (post.user_id !== actualUserId) {
          const postOwner = await this.userRepository.findOne({
            where: { id: post.user_id },
          });
          const liker = await this.userRepository.findOne({
            where: { id: actualUserId },
          });

          if (postOwner && liker) {
            const userName = liker.full_name || liker.user_name || 'Someone';
            await this.notificationsService.createNotification(
              post.user_id,
              'like',
              `${userName} liked your post`,
              { post_id: post.id, actor_user_id: actualUserId },
              actualUserId,
            );
          }
        }

        console.log(
          '✅ Post liked successfully - new count:',
          post.likes_count,
        );
        return {
          success: true,
          message: 'Post liked successfully',
          liked: true,
          like_id: savedLike.id,
        };
      }
    } catch (error) {
      console.error('❌ Like error:', error.message);
      return {
        success: false,
        message: 'Failed to like post: ' + error.message,
      };
    }
  }

  async comment(commentPostDto: CommentPostDto, userId?: number) {
    try {
      const actualUserId = userId || (commentPostDto as any).user_id;

      // Check if post exists
      const post = await this.postRepository.findOne({
        where: { id: commentPostDto.post_id },
      });

      if (!post) {
        return {
          success: false,
          message: 'Post not found',
        };
      }

      // Create comment
      const newComment = this.commentRepository.create({
        user_id: actualUserId,
        post_id: commentPostDto.post_id,
        comment: commentPostDto.comment,
      });

      const savedComment = await this.commentRepository.save(newComment);

      // Recount in SQL (atomic) instead of read-modify-write.
      await this.postQuery.refreshCounts(post.id);

      // Load user data for response
      const commentWithUser = await this.commentRepository.findOne({
        where: { id: savedComment.id },
        relations: ['user'],
      });

      // Create notification for post owner (if not commenting on own post)
      if (post.user_id !== actualUserId) {
        const postOwner = await this.userRepository.findOne({
          where: { id: post.user_id },
        });
        const commenter = await this.userRepository.findOne({
          where: { id: actualUserId },
        });

        if (postOwner && commenter) {
          const userName = commenter.full_name || commenter.user_name || 'Someone';
          await this.notificationsService.createNotification(
            post.user_id,
            'comment',
            `${userName} commented on your post`,
            { post_id: post.id, comment_id: savedComment.id, actor_user_id: actualUserId },
            actualUserId,
          );
        }
      }

      return {
        success: true,
        message: 'Comment added successfully',
        comment: commentWithUser
          ? { ...commentWithUser, user: toSafeUser(commentWithUser.user) }
          : commentWithUser,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to add comment: ' + error.message,
      };
    }
  }

  async getLikedPosts(userId?: number) {
    try {
      // Get all likes by user
      const likes = await this.likeRepository.find({
        where: { user_id: userId },
        relations: ['post', 'post.user', 'post.category'],
      });

      const likedPosts = likes
        .filter((like) => like.post && like.post.is_active)
        .map((like) => ({ ...like.post, user: toSafeUser(like.post.user) }));

      return {
        success: true,
        message: 'Liked posts retrieved successfully',
        posts: likedPosts,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get liked posts: ' + error.message,
        posts: [],
      };
    }
  }

  async getFavoritePosts(userId: number) {
    try {
      // Get posts liked by the user
      const likes = await this.likeRepository.find({
        where: { user_id: userId },
        relations: ['post', 'post.user', 'post.category', 'post.restaurant'],
      });

      const favoritePosts = likes
        .filter((like) => like.post && like.post.is_active)
        .map((like) => ({ ...like.post, user: toSafeUser(like.post.user) }));

      return {
        success: true,
        message: favoritePosts,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get favorite posts: ' + error.message,
      };
    }
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
