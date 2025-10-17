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

      // Create post
      const post = this.postRepository.create({
        ...createPostDto,
        user_id: userId || (createPostDto as any).user_id,
        category_id: createPostDto.category_id,
        restaurant_id: (createPostDto as any).restaurant_id || null,
        rating: (createPostDto as any).rating || null,
        latitude: (createPostDto as any).latitude || null,
        longitude: (createPostDto as any).longitude || null,
        location: createPostDto.location || null,
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

      return {
        success: true,
        message: 'Post retrieved successfully',
        post: {
          ...post,
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

      // Update post fields
      if (updatePostDto.description)
        post.description = updatePostDto.description;
      if (updatePostDto.images) post.images = updatePostDto.images;
      if (updatePostDto.location) post.location = updatePostDto.location;
      if ((updatePostDto as any).rating)
        post.rating = (updatePostDto as any).rating;

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
      const posts = await this.postRepository.find({
        where: { is_active: true },
        relations: ['user', 'category', 'restaurant', 'likes', 'comments'],
        order: { created_at: 'DESC' },
      });

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

      return {
        success: true,
        message: 'Posts retrieved successfully',
        post: filteredPosts,
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

      // Check if post exists
      const post = await this.postRepository.findOne({
        where: { id: likePostDto.post_id },
      });

      if (!post) {
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
        await this.likeRepository.remove(existingLike);
        post.likes_count = Math.max(0, post.likes_count - 1);
        await this.postRepository.save(post);

        return {
          success: true,
          message: 'Post unliked successfully',
          liked: false,
        };
      } else {
        // Like - add the like
        const newLike = this.likeRepository.create({
          user_id: actualUserId,
          post_id: likePostDto.post_id,
        });

        await this.likeRepository.save(newLike);
        post.likes_count = post.likes_count + 1;
        await this.postRepository.save(post);

        return {
          success: true,
          message: 'Post liked successfully',
          liked: true,
        };
      }
    } catch (error) {
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
