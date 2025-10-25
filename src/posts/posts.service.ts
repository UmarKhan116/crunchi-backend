import { Injectable, NotFoundException } from '@nestjs/common';
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

      // Add image field to user for backwards compatibility
      if (post.user) {
        (post.user as any).image = post.user.profile_picture;
      }

      return {
        success: true,
        message: 'Post retrieved successfully',
        post: {
          ...post,
          file: file,
          review: post.description, // Frontend expects 'review', backend has 'description'
          name: post.location, // Frontend expects 'name' field
          comments,
          likes,
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

  async getPostsByLocation(locationDto: any) {
    try {
      const { latitude, longitude, radius = 40 } = locationDto;

      // Get all active posts with relations
      console.log('🔍 Fetching posts with likes and comments...');
      const posts = await this.postRepository.find({
        where: { is_active: true },
        relations: [
          'user',
          'category',
          'restaurant',
          'likes',
          'likes.user',
          'comments',
          'comments.user',
        ],
        order: { created_at: 'DESC' },
      });

      console.log(`📊 Found ${posts.length} posts`);
      if (posts.length > 0) {
        console.log(`📊 Sample post likes count:`, posts[0].likes?.length || 0);
        console.log(
          `📊 Sample post comments count:`,
          posts[0].comments?.length || 0,
        );
      }

      // Filter posts by distance if location provided
      let filteredPosts = posts;
      if (latitude && longitude) {
        filteredPosts = posts.filter((post) => {
          if (!post.latitude || !post.longitude) return true;

          const distance = this.calculateDistance(
            latitude,
            longitude,
            post.latitude,
            post.longitude,
          );

          return distance <= radius;
        });
      }

      // Transform posts to match frontend expectations
      const transformedPosts = filteredPosts.map((post: any) => {
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

        // Add image field to user for backwards compatibility
        if (post.user) {
          post.user.image = post.user.profile_picture;
        }

        return {
          ...post,
          file: file,
          review: post.description, // Frontend expects 'review', backend has 'description'
          name: post.location, // Frontend expects 'name' field
        };
      });

      return {
        success: true,
        message: 'Posts retrieved successfully',
        post: transformedPosts,
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
        post.likes_count = Math.max(0, post.likes_count - 1);
        await this.postRepository.save(post);

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

        post.likes_count = post.likes_count + 1;
        await this.postRepository.save(post);

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

      // Update comments count
      post.comments_count = post.comments_count + 1;
      await this.postRepository.save(post);

      // Load user data for response
      const commentWithUser = await this.commentRepository.findOne({
        where: { id: savedComment.id },
        relations: ['user'],
      });

      return {
        success: true,
        message: 'Comment added successfully',
        comment: commentWithUser,
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
        .map((like) => like.post);

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
        .map((like) => like.post);

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

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    // Haversine formula to calculate distance in kilometers
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
