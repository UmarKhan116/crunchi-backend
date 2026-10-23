import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceCacheEntry } from '../entities/place-cache.entity';
import { Restaurant } from '../entities/restaurant.entity';
import { Category } from '../entities/category.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { PostsModule } from '../posts/posts.module';
import { GooglePlacesClient } from './google/google-places.client';
import { PlaceCacheService } from './place-cache.service';
import { PlacePhotoService } from './place-photo.service';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { FeedService } from './feed/feed.service';
import { FeedController } from './feed/feed.controller';

/**
 * Places proxy (PRD item 2): /api/feed, /api/places/*, /api/geocode/reverse.
 * The Google key stays on the server; everything is cached in Postgres.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlaceCacheEntry,
      Restaurant,
      Category,
      UserSetting,
    ]),
    PostsModule,
  ],
  controllers: [PlacesController, FeedController],
  providers: [
    GooglePlacesClient,
    PlaceCacheService,
    PlacePhotoService,
    PlacesService,
    FeedService,
  ],
  exports: [PlacesService, PlaceCacheService],
})
export class PlacesModule {}
