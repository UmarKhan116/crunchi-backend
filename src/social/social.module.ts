import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { Follow } from '../entities/follow.entity';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Follow, User, Post]),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'crunchy-super-secret-jwt-key-change-in-production-2024',
      signOptions: { expiresIn: '7d' },
    }),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
