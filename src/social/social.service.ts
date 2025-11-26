import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FollowUserDto } from './dto/follow-user.dto';
import { Follow } from '../entities/follow.entity';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
  ) {}

  async followUser(followUserDto: FollowUserDto, currentUserId?: number) {
    try {
      const followerId = currentUserId || (followUserDto as any).follower_id;
      const followingId = followUserDto.user_id;

      // Check if already following
      const existingFollow = await this.followRepository.findOne({
        where: {
          follower_id: followerId,
          following_id: followingId,
        },
      });

      if (existingFollow) {
        // Unfollow - remove the follow relationship
        await this.followRepository.remove(existingFollow);

        return {
          success: true,
          message: 'User Unfollow',
          following: false,
        };
      } else {
        // Follow - create the follow relationship
        const newFollow = this.followRepository.create({
          follower_id: followerId,
          following_id: followingId,
        });

        await this.followRepository.save(newFollow);

        return {
          success: true,
          message: 'User Follow',
          following: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to follow/unfollow user: ' + error.message,
      };
    }
  }

  async getOtherUserData(userId: number) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, is_active: true },
        relations: ['followers', 'followers.follower', 'following', 'following.following'],
      });

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      // Get user's posts
      let posts = await this.postRepository.find({
        where: { user_id: userId, is_active: true },
        relations: ['category', 'restaurant', 'likes', 'comments'],
        order: { created_at: 'DESC' },
        take: 50,
      });

      // Transform posts to match frontend expectations
      if (posts && posts.length > 0) {
        posts = posts.map((post: any) => {
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
            file: file,
            review: post.description, // Frontend expects 'review', backend has 'description'
            name: post.location, // Frontend expects 'name' field for post title
            restaurant: post.restaurant?.name || post.location, // Restaurant name
          };
        });
      }

      // Get followers count
      const followersCount = await this.followRepository.count({
        where: { following_id: userId },
      });

      // Get following count
      const followingCount = await this.followRepository.count({
        where: { follower_id: userId },
      });

      // Transform followers: follower → follows (to match frontend expectation)
      if (user.followers && user.followers.length > 0) {
        user.followers = user.followers.map((follow: any) => ({
          ...follow,
          follows: follow.follower ? {
            ...follow.follower,
            image: follow.follower.profile_picture || follow.follower.image,
          } : null,
        }));
      } else {
        user.followers = [];
      }

      // Transform following: ensure following property exists with image
      if (user.following && user.following.length > 0) {
        user.following = user.following.map((follow: any) => ({
          ...follow,
          following: follow.following ? {
            ...follow.following,
            image: follow.following.profile_picture || follow.following.image,
          } : null,
        }));
      } else {
        user.following = [];
      }

      // Remove password from response
      delete user.password;
      delete user.reset_password_token;
      delete user.reset_password_expires;

      // Add 'image' field for backwards compatibility (frontend expects 'image')
      const transformedUser = {
        ...user,
        image: user.profile_picture,
      };

      return {
        success: true,
        message: 'User data retrieved successfully',
        user: {
          ...transformedUser,
          posts,
          followers: transformedUser.followers,
          following: transformedUser.following,
          followersCount,
          followingCount,
          postsCount: posts.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get user data: ' + error.message,
      };
    }
  }
}
