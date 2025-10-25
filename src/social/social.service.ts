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
      const followingId = (followUserDto as any).following_id;

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
          message: 'User unfollowed successfully',
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
          message: 'User followed successfully',
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
        relations: ['category', 'likes', 'comments'],
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
