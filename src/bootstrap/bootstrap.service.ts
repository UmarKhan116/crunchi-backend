import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { Follow } from '../entities/follow.entity';
import { Post } from '../entities/post.entity';
import { Advertisement } from '../entities/advertisement.entity';
import { Category } from '../entities/category.entity';
import { Ad, PublicUser } from '../common/contract/types';
import { buildMediaUrl } from '../common/utils/public-url';
import { toPublicUser } from '../common/utils/user-sanitizer';
import { CategoriesService } from '../categories/categories.service';
import { AdvertisementsService } from '../advertisements/advertisements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { googleQueryForCategory } from '../places/category-mapping';
import { AdRules, DEFAULT_AD_RULES } from './ad-rules.config';

const VIDEO_TYPES = new Set(['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm', 'm4v']);

export interface BootstrapCategory {
  id: string;
  name: string;
  imageUrl: string | null;
  googleType: string | null;
  keyword: string | null;
  isSelected: boolean;
}

export interface GuestBootstrap {
  categories: BootstrapCategory[];
  ads: Ad[];
  adRules: AdRules;
}

export interface UserBootstrap extends GuestBootstrap {
  user: PublicUser & {
    bio: string | null;
    followersCount: number;
    followingCount: number;
    postsCount: number;
  };
  settings: {
    notificationsEnabled: boolean;
    darkMode: 'system' | 'light' | 'dark' | null;
  };
  favoritePlaceIds: string[];
  likedPlaceIds: string[];
  unreadNotifications: number;
}

/**
 * GET /api/bootstrap: one startup call instead of the seven SplashScreen.js
 * makes today (profile, settings, categories, favourites, liked places, ads,
 * unread count). Queries run in parallel.
 */
@Injectable()
export class BootstrapService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettings: Repository<UserSetting>,
    @InjectRepository(Follow)
    private readonly follows: Repository<Follow>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    private readonly categoriesService: CategoriesService,
    private readonly advertisementsService: AdvertisementsService,
    private readonly notificationsService: NotificationsService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async forGuest(baseUrl: string): Promise<GuestBootstrap> {
    const [categories, ads] = await Promise.all([
      this.categoriesService.findActive(),
      this.advertisementsService.findActiveAds(),
    ]);
    return {
      categories: categories.map((c) => this.category(c, baseUrl, new Set())),
      ads: ads.map((a) => this.ad(a, baseUrl)),
      adRules: { ...DEFAULT_AD_RULES },
    };
  }

  async forUser(userId: number, baseUrl: string): Promise<UserBootstrap> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: {
        id: true,
        user_name: true,
        full_name: true,
        profile_picture: true,
        bio: true,
        is_active: true,
        app_settings: true,
      },
    });
    // A valid token for a deleted or deactivated account.
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const [
      settings,
      followersCount,
      followingCount,
      postsCount,
      categories,
      ads,
      favoritePlaceIds,
      unreadNotifications,
    ] = await Promise.all([
      this.userSettings.findOne({ where: { user_id: userId } }),
      this.follows.count({ where: { following_id: userId } }),
      this.follows.count({ where: { follower_id: userId } }),
      this.posts.count({ where: { user_id: userId, is_active: true } }),
      this.categoriesService.findActive(),
      this.advertisementsService.findActiveAds(),
      this.restaurantsService.favoritePlaceIds(userId),
      this.notificationsService.countUnread(userId),
    ]);

    const selected = new Set(
      (settings?.favorite_categories ?? []).map((id) => String(id)),
    );

    return {
      user: {
        ...toPublicUser(user, baseUrl),
        bio: user.bio ?? null,
        followersCount,
        followingCount,
        postsCount,
      },
      settings: {
        notificationsEnabled: settings?.notifications_enabled ?? true,
        darkMode: darkModeOf(user.app_settings),
      },
      categories: categories.map((c) => this.category(c, baseUrl, selected)),
      favoritePlaceIds,
      likedPlaceIds: favoritePlaceIds,
      ads: ads.map((a) => this.ad(a, baseUrl)),
      adRules: { ...DEFAULT_AD_RULES },
      unreadNotifications,
    };
  }

  private category(
    c: Category,
    baseUrl: string,
    selected: Set<string>,
  ): BootstrapCategory {
    const google = googleQueryForCategory(c.name);
    return {
      id: String(c.id),
      name: c.name,
      imageUrl: buildMediaUrl(baseUrl, 'category', c.icon),
      googleType: google.googleType,
      keyword: google.keyword,
      isSelected: selected.has(String(c.id)),
    };
  }

  private ad(a: Advertisement, baseUrl: string): Ad {
    const ext = (a.type || a.file_name?.split('.').pop() || '').toLowerCase();
    return {
      adId: String(a.id),
      // image_url is "/storage/video/<file_name>" for admin-uploaded ads.
      mediaUrl:
        buildMediaUrl(baseUrl, 'video', a.file_name) ??
        buildMediaUrl(baseUrl, '', a.image_url),
      mediaType: VIDEO_TYPES.has(ext) ? 'video' : 'image',
      linkUrl: a.link_url ?? null,
      title: a.title ?? null,
    };
  }
}

/**
 * users.app_settings is written by POST /api/app-setting as strings:
 * toggledark_mode 'true' = follow the system, else dark_mode 'true'/'false'.
 */
export function darkModeOf(
  appSettings: User['app_settings'] | null | undefined,
): 'system' | 'light' | 'dark' | null {
  if (!appSettings) return null;
  const truthy = (v: unknown) => v === true || v === 'true';
  if (truthy(appSettings.toggledark_mode)) return 'system';
  if (appSettings.dark_mode === undefined || appSettings.dark_mode === null) {
    return null;
  }
  return truthy(appSettings.dark_mode) ? 'dark' : 'light';
}
