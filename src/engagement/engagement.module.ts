import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../entities/post.entity';
import { User } from '../entities/user.entity';
import { Comment } from '../entities/comment.entity';
import { PostsModule } from '../posts/posts.module';
import { PlacesModule } from '../places/places.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EngagementController } from './engagement.controller';
import { PostLikesService } from './post-likes.service';
import { PlaceSavesService } from './place-saves.service';

/**
 * Milestone 2 interactions on posts and places: set-state likes and
 * favourites, comments, and the single-post read used by deep links.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Post, User, Comment]),
    PostsModule,
    PlacesModule,
    NotificationsModule,
  ],
  controllers: [EngagementController],
  providers: [PostLikesService, PlaceSavesService],
})
export class EngagementModule {}
