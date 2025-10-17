import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettingsDto } from './dto/user-settings.dto';
import { AppSettingsDto } from './dto/app-settings.dto';
import { UserSetting } from '../entities/user-setting.entity';
import { AppSetting } from '../entities/app-setting.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    @InjectRepository(AppSetting)
    private readonly appSettingRepository: Repository<AppSetting>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async saveUserSettings(userSettingsDto: UserSettingsDto, userId?: number) {
    try {
      const actualUserId = userId || (userSettingsDto as any).user_id;

      // Find existing settings or create new
      let userSettings = await this.userSettingRepository.findOne({
        where: { user_id: actualUserId },
      });

      if (userSettings) {
        // Update existing settings
        if (userSettingsDto.notifications_enabled !== undefined)
          userSettings.notifications_enabled =
            userSettingsDto.notifications_enabled;
        if (userSettingsDto.location_sharing !== undefined)
          userSettings.location_sharing = userSettingsDto.location_sharing;
        if (userSettingsDto.profile_visibility !== undefined)
          userSettings.profile_visibility = userSettingsDto.profile_visibility;
        if (userSettingsDto.language)
          userSettings.language = userSettingsDto.language;
        if (userSettingsDto.distance_unit)
          userSettings.distance_unit = userSettingsDto.distance_unit;
        if (userSettingsDto.search_radius !== undefined)
          userSettings.search_radius = userSettingsDto.search_radius;
        if (userSettingsDto.favorite_categories)
          userSettings.favorite_categories =
            userSettingsDto.favorite_categories;
        if (userSettingsDto.dietary_preferences)
          userSettings.dietary_preferences =
            userSettingsDto.dietary_preferences;
      } else {
        // Create new settings
        userSettings = this.userSettingRepository.create({
          user_id: actualUserId,
          ...userSettingsDto,
        });
      }

      const savedSettings = await this.userSettingRepository.save(userSettings);

      return {
        success: true,
        message: 'User settings saved successfully',
        settings: savedSettings,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save user settings: ' + error.message,
      };
    }
  }

  async getAppSettings(userId?: number) {
    try {
      // Get user-specific settings if userId provided
      let userSettings = null;
      if (userId) {
        userSettings = await this.userSettingRepository.findOne({
          where: { user_id: userId },
        });
      }

      // Get all app settings
      const appSettings = await this.appSettingRepository.find({
        where: { is_active: true },
      });

      return {
        success: true,
        message: 'App settings retrieved successfully',
        userSettings: userSettings || {},
        appSettings,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get app settings: ' + error.message,
        userSettings: {},
        appSettings: [],
      };
    }
  }

  async saveAppSettings(appSettingsDto: AppSettingsDto) {
    try {
      // Find existing setting by key or create new
      let appSetting = await this.appSettingRepository.findOne({
        where: { key: appSettingsDto.key },
      });

      if (appSetting) {
        // Update existing setting
        appSetting.value = appSettingsDto.value;
        if (appSettingsDto.description)
          appSetting.description = appSettingsDto.description;
      } else {
        // Create new setting
        appSetting = this.appSettingRepository.create(appSettingsDto);
      }

      const savedSetting = await this.appSettingRepository.save(appSetting);

      return {
        success: true,
        message: 'App setting saved successfully',
        setting: savedSetting,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save app setting: ' + error.message,
      };
    }
  }
}
