import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FavoriteRestaurantDto } from './dto/favorite-restaurant.dto';
import { Restaurant } from '../entities/restaurant.entity';
import { Favorite } from '../entities/favorite.entity';
import { Post } from '../entities/post.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async favorite(
    favoriteRestaurantDto: FavoriteRestaurantDto,
    userId?: number,
  ) {
    try {
      const actualUserId = userId || (favoriteRestaurantDto as any).user_id;

      // Debug: Log incoming data
      console.log('📥 Favorite Restaurant API - Received data:');
      console.log('  - Name:', (favoriteRestaurantDto as any).name);
      console.log(
        '  - Google Place ID:',
        (favoriteRestaurantDto as any).google_place_id,
      );
      console.log(
        '  - Photo Reference:',
        (favoriteRestaurantDto as any).photo_reference?.substring(0, 30) +
          '...',
      );
      console.log('  - Address:', (favoriteRestaurantDto as any).address);
      console.log('  - Rating:', (favoriteRestaurantDto as any).rating);

      // Check if restaurant exists by google_place_id first, then by id
      let restaurant = null;

      if ((favoriteRestaurantDto as any).google_place_id) {
        restaurant = await this.restaurantRepository.findOne({
          where: {
            google_place_id: (favoriteRestaurantDto as any).google_place_id,
          },
        });
      }

      if (!restaurant && favoriteRestaurantDto.restaurant_id) {
        restaurant = await this.restaurantRepository.findOne({
          where: { id: favoriteRestaurantDto.restaurant_id },
        });
      }

      // If restaurant exists but has incomplete data, update it
      if (restaurant && (favoriteRestaurantDto as any).google_place_id) {
        let needsUpdate = false;

        // Update if name is missing or "Unknown Restaurant"
        if (!restaurant.name || restaurant.name === 'Unknown Restaurant') {
          restaurant.name =
            (favoriteRestaurantDto as any).name || restaurant.name;
          needsUpdate = true;
        }

        // Update if photo reference is missing
        if (
          !restaurant.google_photo_reference &&
          (favoriteRestaurantDto as any).photo_reference
        ) {
          restaurant.google_photo_reference = (
            favoriteRestaurantDto as any
          ).photo_reference;
          needsUpdate = true;
        }

        // Update other fields if missing
        if (!restaurant.address && (favoriteRestaurantDto as any).address) {
          restaurant.address = (favoriteRestaurantDto as any).address;
          needsUpdate = true;
        }

        if (!restaurant.latitude && (favoriteRestaurantDto as any).latitude) {
          restaurant.latitude = (favoriteRestaurantDto as any).latitude;
          needsUpdate = true;
        }

        if (!restaurant.longitude && (favoriteRestaurantDto as any).longitude) {
          restaurant.longitude = (favoriteRestaurantDto as any).longitude;
          needsUpdate = true;
        }

        if (
          !restaurant.google_rating &&
          (favoriteRestaurantDto as any).rating
        ) {
          restaurant.google_rating = (favoriteRestaurantDto as any).rating;
          needsUpdate = true;
        }

        if (needsUpdate) {
          console.log('🔄 Updating incomplete restaurant data:', {
            id: restaurant.id,
            name: restaurant.name,
            photo_reference:
              restaurant.google_photo_reference?.substring(0, 20) + '...',
          });
          restaurant = await this.restaurantRepository.save(restaurant);
        }
      }

      // If restaurant doesn't exist and has google place id, create it
      if (!restaurant && (favoriteRestaurantDto as any).google_place_id) {
        console.log(
          '✨ Creating new restaurant:',
          (favoriteRestaurantDto as any).name,
        );
        restaurant = this.restaurantRepository.create({
          name: (favoriteRestaurantDto as any).name || 'Unknown Restaurant',
          google_place_id: (favoriteRestaurantDto as any).google_place_id,
          google_rating: (favoriteRestaurantDto as any).rating || null,
          address: (favoriteRestaurantDto as any).address || null,
          latitude: (favoriteRestaurantDto as any).latitude || null,
          longitude: (favoriteRestaurantDto as any).longitude || null,
          google_photo_reference:
            (favoriteRestaurantDto as any).photo_reference || null,
        });
        restaurant = await this.restaurantRepository.save(restaurant);

        console.log('✅ Restaurant saved to DB:');
        console.log('  - ID:', restaurant.id);
        console.log('  - Name:', restaurant.name);
        console.log(
          '  - Photo Reference:',
          restaurant.google_photo_reference?.substring(0, 30) + '...',
        );
      }

      if (!restaurant) {
        return {
          success: false,
          message: 'Restaurant not found',
        };
      }

      // Check if user already favorited this restaurant
      const existingFavorite = await this.favoriteRepository.findOne({
        where: {
          user_id: actualUserId,
          restaurant_id: restaurant.id,
        },
      });

      if (existingFavorite) {
        // Unfavorite - remove the favorite
        await this.favoriteRepository.remove(existingFavorite);

        return {
          success: true,
          message: 'Restaurant unfavorited successfully',
          favorited: false,
        };
      } else {
        // Favorite - add the favorite
        const newFavorite = this.favoriteRepository.create({
          user_id: actualUserId,
          restaurant_id: restaurant.id,
        });

        await this.favoriteRepository.save(newFavorite);

        return {
          success: true,
          message: 'Restaurant favorited successfully',
          favorited: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to favorite restaurant: ' + error.message,
      };
    }
  }

  /**
   * Google place ids the user has favourited. The legacy `favoriteplace` and
   * `googlelike` endpoints both write this table, so this is also the list of
   * liked places.
   */
  async favoritePlaceIds(userId: number): Promise<string[]> {
    const rows: { google_place_id: string }[] = await this.favoriteRepository
      .createQueryBuilder('f')
      .innerJoin('f.restaurant', 'r')
      .select('DISTINCT r.google_place_id', 'google_place_id')
      .where('f.user_id = :userId', { userId })
      .andWhere('r.google_place_id IS NOT NULL')
      .getRawMany();
    return rows.map((r) => r.google_place_id);
  }

  async getUserFavorites(userId?: number) {
    try {
      // Get all favorites by user
      const favorites = await this.favoriteRepository.find({
        where: { user_id: userId },
        relations: ['restaurant'],
      });

      const favoriteRestaurants = favorites
        .filter((fav) => fav.restaurant)
        .map((fav) => fav.restaurant);

      console.log('🍽️ GET FAVORITES API - Returning data:');
      console.log('  - Total favorites:', favoriteRestaurants.length);
      if (favoriteRestaurants.length > 0) {
        console.log('  - First restaurant:', {
          id: favoriteRestaurants[0].id,
          name: favoriteRestaurants[0].name,
          google_place_id: favoriteRestaurants[0].google_place_id,
          google_photo_reference:
            favoriteRestaurants[0].google_photo_reference?.substring(0, 30) +
            '...',
        });
      }

      return {
        success: true,
        message: 'Favorite restaurants retrieved successfully',
        data: favoriteRestaurants,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get favorite restaurants: ' + error.message,
        data: [],
      };
    }
  }

  async getFavoriteRestaurantsByUserId(userId: number) {
    try {
      // Get all favorites by user
      const favorites = await this.favoriteRepository.find({
        where: { user_id: userId },
        relations: ['restaurant'],
      });

      const favoriteRestaurants = favorites
        .filter((fav) => fav.restaurant)
        .map((fav) => fav.restaurant);

      return {
        success: true,
        message: 'User favorite restaurants retrieved successfully',
        data: favoriteRestaurants,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get user favorite restaurants: ' + error.message,
        data: [],
      };
    }
  }

  async googleMedia(googleData: any, userId?: number) {
    try {
      const actualUserId = userId || googleData.user_id;

      // Find or create restaurant
      let restaurant = await this.restaurantRepository.findOne({
        where: { google_place_id: googleData.restaurant_id },
      });

      if (!restaurant) {
        restaurant = this.restaurantRepository.create({
          name: googleData.restaurantName || 'Unknown Restaurant',
          google_place_id: googleData.restaurant_id,
          google_rating: googleData.restaurantRating || null,
          google_photo_reference: googleData.restaurantImage || null,
          latitude: googleData.latitude || null,
          longitude: googleData.longitude || null,
          address: googleData.address || null,
        });
        restaurant = await this.restaurantRepository.save(restaurant);
      }

      return {
        success: true,
        message: 'Google Places data saved successfully',
        restaurant,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save Google Places data: ' + error.message,
      };
    }
  }

  async getGooglePost(restaurantId: string) {
    try {
      // Get restaurant by google place id
      const restaurant = await this.restaurantRepository.findOne({
        where: { google_place_id: restaurantId },
      });

      if (!restaurant) {
        return {
          success: false,
          message: 'Restaurant not found',
        };
      }

      return {
        success: true,
        message: 'Google Places data retrieved successfully',
        data: restaurant,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get Google Places data: ' + error.message,
      };
    }
  }

  async googleLike(likeData: any, userId?: number) {
    try {
      const actualUserId = userId || likeData.user_id;
      const googlePlaceId = likeData.restaurant_id || likeData.place_id;

      // Find or create restaurant
      let restaurant = await this.restaurantRepository.findOne({
        where: { google_place_id: googlePlaceId },
      });

      if (!restaurant) {
        restaurant = this.restaurantRepository.create({
          name:
            likeData.name || likeData.restaurantName || 'Unknown Restaurant',
          google_place_id: googlePlaceId,
          google_rating: likeData.rating || likeData.restaurantRating || null,
          google_photo_reference:
            likeData.photo_reference || likeData.restaurantImage || null,
          latitude: likeData.latitude || null,
          longitude: likeData.longitude || null,
          address: likeData.address || null,
        });
        restaurant = await this.restaurantRepository.save(restaurant);
      }

      // Check if user already favorited this restaurant
      const existingFavorite = await this.favoriteRepository.findOne({
        where: {
          user_id: actualUserId,
          restaurant_id: restaurant.id,
        },
      });

      if (existingFavorite) {
        // Unlike
        await this.favoriteRepository.remove(existingFavorite);
        return {
          success: true,
          message: 'Google Place unliked successfully',
          liked: false,
        };
      } else {
        // Like
        const newFavorite = this.favoriteRepository.create({
          user_id: actualUserId,
          restaurant_id: restaurant.id,
        });
        await this.favoriteRepository.save(newFavorite);

        return {
          success: true,
          message: 'Google Place liked successfully',
          liked: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to like Google Place: ' + error.message,
      };
    }
  }

  async getUserLikedGooglePosts(userId?: number) {
    try {
      // Get all favorites by user
      const favorites = await this.favoriteRepository.find({
        where: { user_id: userId },
        relations: ['restaurant'],
      });

      // Filter only google places
      const googlePlaces = favorites
        .filter((fav) => fav.restaurant && fav.restaurant.google_place_id)
        .map((fav) => ({
          ...fav.restaurant,
          restaurant_id: fav.restaurant.google_place_id,
          isGoogle: true,
        }));

      return {
        success: true,
        message: 'User liked Google Places retrieved successfully',
        data: googlePlaces,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get liked Google Places: ' + error.message,
        data: [],
      };
    }
  }

  async getAllRestaurants() {
    try {
      const restaurants = await this.restaurantRepository.find({
        where: { is_active: true },
        order: { created_at: 'DESC' },
      });

      return {
        success: true,
        message: 'Restaurants retrieved successfully',
        data: restaurants,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get restaurants: ' + error.message,
        data: [],
      };
    }
  }

  async getRestaurantById(restaurantId: number) {
    try {
      const restaurant = await this.restaurantRepository.findOne({
        where: { id: restaurantId },
        relations: ['posts', 'posts.user', 'posts.category'],
      });

      if (!restaurant) {
        return {
          success: false,
          message: 'Restaurant not found',
        };
      }

      return {
        success: true,
        message: 'Restaurant retrieved successfully',
        data: restaurant,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get restaurant: ' + error.message,
      };
    }
  }

  async getRestaurantByGooglePlaceId(googlePlaceId: string) {
    try {
      const restaurant = await this.restaurantRepository.findOne({
        where: { google_place_id: googlePlaceId },
        relations: ['posts', 'posts.user', 'posts.category'],
      });

      if (!restaurant) {
        return {
          success: false,
          message: 'Restaurant not found',
        };
      }

      return {
        success: true,
        message: 'Restaurant retrieved successfully',
        data: restaurant,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get restaurant: ' + error.message,
      };
    }
  }
}
