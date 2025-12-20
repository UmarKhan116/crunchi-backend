import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { Post } from '../entities/post.entity';
import { Like } from '../entities/like.entity';
import { Comment } from '../entities/comment.entity';
import { User } from '../entities/user.entity';
import { Category } from '../entities/category.entity';
import { Restaurant } from '../entities/restaurant.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Like, Comment, User, Category, Restaurant]),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'crunchy-super-secret-jwt-key-change-in-production-2024',
      signOptions: { expiresIn: '7d' },
    }),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
