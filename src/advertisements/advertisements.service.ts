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

  async getAdvertisements() {
    try {
      const advertisements = await this.advertisementRepository.find({
        where: { is_active: true },
        order: { created_at: 'DESC' },
      });

      // Filter out ads that don't have required fields (type and file_name)
      // This handles legacy ads created before these fields were added
      const validAdvertisements = advertisements.filter(
        (ad) => ad.type && ad.file_name,
      );

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

  async trackAdvertisementView(viewData: any) {
    try {
      const advertisementId = viewData.advertisement_id || viewData.ad_id;
      const userId = viewData.user_id;

      // Find or create advertisement view
      let adView = await this.advertisementViewRepository.findOne({
        where: {
          advertisement_id: advertisementId,
          user_id: userId,
        },
      });

      if (adView) {
        // Update existing view
        adView.view_count += 1;
        if (viewData.clicked) {
          adView.click_count += 1;
        }
      } else {
        // Create new view
        adView = this.advertisementViewRepository.create({
          advertisement_id: advertisementId,
          user_id: userId,
          view_count: 1,
          click_count: viewData.clicked ? 1 : 0,
        });
      }

      await this.advertisementViewRepository.save(adView);

      // Update advertisement counts
      const advertisement = await this.advertisementRepository.findOne({
        where: { id: advertisementId },
      });

      if (advertisement) {
        advertisement.views_count += 1;
        if (viewData.clicked) {
          advertisement.clicks_count += 1;
        }
        await this.advertisementRepository.save(advertisement);
      }

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
