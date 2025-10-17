import {
  Controller,
  Get,
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

@ApiTags('Notifications')
@Controller('api')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
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
}
