import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { PlacesModule } from '../places/places.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AccountService } from './account.service';

/** Milestone 2 users and profile endpoints, plus PATCH/DELETE /api/me. */
@Module({
  imports: [PostsModule, PlacesModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService, AccountService],
  exports: [UsersService],
})
export class UsersModule {}
