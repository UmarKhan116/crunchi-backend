import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Advertisement } from '../entities/advertisement.entity';
import { AdvertisementView } from '../entities/advertisement-view.entity';
import { User } from '../entities/user.entity';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';

@Injectable()
export class AdvertisementsService {
  constructor(
    @InjectRepository(Advertisement)
    private readonly advertisementRepository: Repository<Advertisement>,
    @InjectRepository(AdvertisementView)
    private readonly advertisementViewRepository: Repository<AdvertisementView>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createAdvertisement(
    payload: CreateAdvertisementDto & {
      file_name: string;
      type: string;
    },
  ) {
    try {
      const advertisement = this.advertisementRepository.create({
        title: payload.title,
        description: payload.description,
        is_active: true,
        file_name: payload.file_name,
        type: payload.type,
        image_url: `/storage/video/${payload.file_name}`,
      });

      const saved = await this.advertisementRepository.save(advertisement);

      return {
        success: true,
        message: 'Advertisement created successfully',
        data: saved,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create advertisement: ' + error.message,
      };
    }
  }

  /**
   * Active ads the app can render. Ads without type/file_name predate those
   * fields and are skipped.
   */
  async findActiveAds(): Promise<Advertisement[]> {
    const advertisements = await this.advertisementRepository.find({
      where: { is_active: true },
      order: { created_at: 'DESC' },
    });
    return advertisements.filter((ad) => ad.type && ad.file_name);
  }

  async getAdvertisements() {
    try {
      const validAdvertisements = await this.findActiveAds();

      return {
        success: true,
        message: 'Advertisements retrieved successfully',
        data: validAdvertisements,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get advertisements: ' + error.message,
        data: [],
      };
    }
  }

  /** The viewer always comes from the token; a body `user_id` is ignored. */
  async trackAdvertisementView(viewData: any, userId: number) {
    try {
      const advertisementId = Number(
        viewData?.advertisement_id ?? viewData?.ad_id,
      );
      const clicked = viewData?.clicked ? 1 : 0;

      if (!Number.isInteger(advertisementId) || advertisementId <= 0) {
        return {
          success: false,
          message: 'advertisement_id is required',
        };
      }

      const exists = await this.advertisementRepository.exists({
        where: { id: advertisementId },
      });
      if (!exists) {
        return {
          success: false,
          message: 'Advertisement not found',
        };
      }

      // Upsert + increments in single statements so concurrent views from
      // the same user never lose a count or hit the unique constraint.
      await this.advertisementViewRepository.query(
        `INSERT INTO advertisement_views (advertisement_id, user_id, view_count, click_count)
         VALUES ($1, $2, 1, $3)
         ON CONFLICT (advertisement_id, user_id)
         DO UPDATE SET view_count = advertisement_views.view_count + 1,
                       click_count = advertisement_views.click_count + EXCLUDED.click_count`,
        [advertisementId, userId, clicked],
      );
      await this.advertisementRepository.query(
        `UPDATE advertisements
            SET views_count = views_count + 1,
                clicks_count = clicks_count + $2
          WHERE id = $1`,
        [advertisementId, clicked],
      );

      return {
        success: true,
        message: 'Advertisement view tracked successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to track advertisement view: ' + error.message,
      };
    }
  }
}
