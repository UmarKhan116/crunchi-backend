import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../entities/post.entity';
import { Restaurant } from '../entities/restaurant.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  async uploadImage(file: Express.Multer.File) {
    try {
      if (!file) {
        return {
          success: false,
          message: 'No file provided',
        };
      }

      // File is already saved by multer, just return the filename
      return {
        success: true,
        message: 'Image uploaded successfully',
        url: file.filename,
        path: `/storage/${file.filename}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload image: ' + error.message,
      };
    }
  }

  async removeImage(filename: string) {
    try {
      const filePath = path.join(__dirname, '..', '..', 'storage', filename);

      // Check if file exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return {
          success: true,
          message: 'Image removed successfully',
        };
      } else {
        return {
          success: false,
          message: 'Image not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to remove image: ' + error.message,
      };
    }
  }

  async getRestaurantMedia(restaurantId: string) {
    try {
      // Get all posts for this restaurant
      const posts = await this.postRepository.find({
        where: { restaurant_id: parseInt(restaurantId), is_active: true },
        relations: ['user', 'category'],
        order: { created_at: 'DESC' },
      });

      // Extract all images from posts
      const media = posts.flatMap((post) => {
        if (post.images && post.images.length > 0) {
          return post.images.map((image) => ({
            image,
            post_id: post.id,
            user: post.user,
            description: post.description,
            created_at: post.created_at,
          }));
        }
        return [];
      });

      return {
        success: true,
        message: 'Restaurant media retrieved successfully',
        data: media,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get restaurant media: ' + error.message,
        data: [],
      };
    }
  }
}
