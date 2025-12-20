import {
  Controller,
  Get,
  Post,
  Body,
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
import { NotificationsService } from './notifications.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@ApiTags('Notifications')
@Controller('api')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

  @Get('getUserNotification')
  @ApiOperation({ summary: 'Get all notifications for user' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'User notifications retrieved successfully',
  })
  async getUserNotifications(@Headers('authorization') authorization: string) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.notificationsService.getUserNotifications(userId);
  }

  @Post('update-device-token')
  @ApiOperation({ summary: 'Update device token for push notifications' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Device token updated successfully',
  })
  async updateDeviceToken(
    @Headers('authorization') authorization: string,
    @Body() body: { device_token?: string; fcm_token?: string },
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    const deviceToken = body.device_token || body.fcm_token;

    if (!deviceToken) {
      return {
        success: false,
        message: 'device_token or fcm_token is required',
      };
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    user.device_token = deviceToken;
    await this.userRepository.save(user);

    console.log(`✅ Updated device token for user ${userId}`);

    return {
      success: true,
      message: 'Device token updated successfully',
    };
  }
}
