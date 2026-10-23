// Must stay the first import: snapshots JWT_SECRET before .env is loaded.
import './common/auth/jwt-secrets';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { PostsModule } from './posts/posts.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdvertisementsModule } from './advertisements/advertisements.module';
import { MediaModule } from './media/media.module';
import { SocialModule } from './social/social.module';
import { SearchModule } from './search/search.module';
import { SettingsModule } from './settings/settings.module';
import { SessionModule } from './session/session.module';
import { getDatabaseConfig } from './config/database.config';
import { AdminModule } from './admin/admin.module';
import { AuthCommonModule } from './common/auth/auth-common.module';
import { PlacesModule } from './places/places.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { EngagementModule } from './engagement/engagement.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    // Only used by routes that opt in with @UseGuards(ThrottlerGuard):
    // login, register, forgot and socialLogin get 10 requests/min per IP.
    ThrottlerModule.forRoot([{ name: 'auth', ttl: 60_000, limit: 10 }]),
    // Push outbox worker (src/notifications/push/push-outbox.worker.ts).
    ScheduleModule.forRoot(),
    AuthCommonModule,
    AuthModule,
    CategoriesModule,
    PostsModule,
    RestaurantsModule,
    NotificationsModule,
    AdvertisementsModule,
    MediaModule,
    SocialModule,
    SearchModule,
    SettingsModule,
    SessionModule,
    AdminModule,
    PlacesModule,
    BootstrapModule,
    EngagementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
