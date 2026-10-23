import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../entities/post.entity';
import { Restaurant } from '../entities/restaurant.entity';
import * as fs from 'fs';
import * as path from 'path';
import {
  resolveInsideStorage,
  STORAGE_ROOT,
} from '../common/utils/storage-path';
import { toSafeUser } from '../common/utils/user-sanitizer';

/** Uploads are named `image-u<userId>-…` (see media.module.ts) to record the owner. */
export function uploadOwnerPrefix(userId: number) {
  return `image-u${userId}-`;
}

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

  /** Overridable in tests. */
  protected storageRoot = STORAGE_ROOT;

  async removeImage(userId: number, filename: string) {
    // Throws 400 for empty names and anything resolving outside storage/.
    const filePath = resolveInsideStorage(this.storageRoot, filename);
    const name = path.relative(this.storageRoot, filePath);

    if (!(await this.ownsUpload(userId, name))) {
      throw new ForbiddenException('You can only remove your own uploads');
    }

    try {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return {
          success: false,
          message: 'Image not found',
        };
      }
      fs.unlinkSync(filePath);
      return {
        success: true,
        message: 'Image removed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to remove image: ' + error.message,
      };
    }
  }

  /**
   * New uploads carry the owner in their name. Older uploads have no owner
   * record, so they count as yours only when one of your posts uses them.
   */
  private async ownsUpload(userId: number, name: string): Promise<boolean> {
    if (
      !name.includes(path.sep) &&
      name.startsWith(uploadOwnerPrefix(userId))
    ) {
      return true;
    }
    const rows = await this.postRepository.query(
      `SELECT 1 FROM posts
        WHERE user_id = $1
          AND images IS NOT NULL
          AND images::jsonb @> jsonb_build_array($2::text)
        LIMIT 1`,
      [userId, name],
    );
    return rows.length > 0;
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
            user: toSafeUser(post.user),
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
