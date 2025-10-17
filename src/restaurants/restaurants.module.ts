import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { Restaurant } from '../entities/restaurant.entity';
import { Favorite } from '../entities/favorite.entity';
import { Post } from '../entities/post.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Restaurant, Favorite, Post, User]),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'crunchy-super-secret-jwt-key-change-in-production-2024',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
