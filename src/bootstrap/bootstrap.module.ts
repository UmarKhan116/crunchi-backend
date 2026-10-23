import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { Follow } from '../entities/follow.entity';
import { Post } from '../entities/post.entity';
import { CategoriesModule } from '../categories/categories.module';
import { AdvertisementsModule } from '../advertisements/advertisements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

/** GET /api/bootstrap and /api/bootstrap/guest. */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSetting, Follow, Post]),
    CategoriesModule,
    AdvertisementsModule,
    NotificationsModule,
    RestaurantsModule,
  ],
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
