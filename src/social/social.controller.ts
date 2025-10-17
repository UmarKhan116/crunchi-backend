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
import { SocialService } from './social.service';
import { FollowUserDto } from './dto/follow-user.dto';

@ApiTags('Social')
@Controller('api')
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
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

  @Post('user-follows')
  @ApiOperation({ summary: 'Follow/unfollow a user' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'User follow status updated successfully',
  })
  async followUser(
    @Body(ValidationPipe) followUserDto: FollowUserDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.socialService.followUser(followUserDto, userId);
  }

  @Get('other_get_user/:userID')
  @ApiOperation({ summary: 'Get other user data' })
  @ApiResponse({ status: 200, description: 'User data retrieved successfully' })
  async getOtherUserData(@Param('userID') userId: string) {
    return this.socialService.getOtherUserData(parseInt(userId));
  }
}
