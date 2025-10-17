import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ValidationPipe,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { RestaurantsService } from './restaurants.service';
import { FavoriteRestaurantDto } from './dto/favorite-restaurant.dto';

@ApiTags('Restaurants')
@Controller('api')
export class RestaurantsController {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly jwtService: JwtService,
  ) {}

  private extractUserIdFromToken(authorization: string): number {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      const token = authorization.split(' ')[1];
      const decoded = this.jwtService.verify(token);

      if (!decoded.id) {
        throw new UnauthorizedException('Invalid token payload');
      }

      return decoded.id;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @Post('favoriteplace')
  @ApiOperation({ summary: 'Like a restaurant' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Restaurant liked successfully' })
  async favorite(
    @Body(ValidationPipe) favoriteRestaurantDto: FavoriteRestaurantDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.restaurantsService.favorite(favoriteRestaurantDto, userId);
  }

  @Get('userfavoriteplace')
  @ApiOperation({ summary: 'Get user favorite restaurants' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Favorite restaurants retrieved successfully',
  })
  async getUserFavorites(@Headers('authorization') authorization: string) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.restaurantsService.getUserFavorites(userId);
  }

  @Get('getFavoriteRestaurantsByUserId/:userId')
  @ApiOperation({ summary: 'Get favorite restaurants by user ID' })
  @ApiResponse({
    status: 200,
    description: 'User favorite restaurants retrieved successfully',
  })
  async getFavoriteRestaurantsByUserId(@Param('userId') userId: string) {
    return this.restaurantsService.getFavoriteRestaurantsByUserId(
      parseInt(userId),
    );
  }

  @Post('googlemedia')
  @ApiOperation({ summary: 'Google Places integration' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Google Places data processed successfully',
  })
  async googleMedia(
    @Body() googleData: any,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.restaurantsService.googleMedia(googleData, userId);
  }

  @Get('get_google_post/:restaurant_id')
  @ApiOperation({ summary: 'Get Google Places data for restaurant' })
  @ApiResponse({
    status: 200,
    description: 'Google Places data retrieved successfully',
  })
  async getGooglePost(@Param('restaurant_id') restaurantId: string) {
    return this.restaurantsService.getGooglePost(restaurantId);
  }

  @Post('googlelike')
  @ApiOperation({ summary: 'Like a Google Place' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Google Place liked successfully' })
  async googleLike(
    @Body() likeData: any,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.restaurantsService.googleLike(likeData, userId);
  }

  @Get('userlikedgooglepost')
  @ApiOperation({ summary: 'Get user liked Google Places' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'User liked Google Places retrieved successfully',
  })
  async getUserLikedGooglePosts(
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.restaurantsService.getUserLikedGooglePosts(userId);
  }
}
