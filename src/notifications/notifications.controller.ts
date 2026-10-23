import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { DeviceTokensService } from './device-tokens.service';
import { RegisterDeviceTokenDto } from './dto/device-token.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { CursorQueryDto, pageLimit } from '../common/dto/cursor-query.dto';
import { BaseUrl } from '../common/utils/public-url';
import { User } from '../entities/user.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/http/api-envelope';

@ApiTags('Notifications')
@Controller('api')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly deviceTokens: DeviceTokensService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get('getUserNotification')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all notifications for user (legacy)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'User notifications retrieved successfully',
  })
  async getUserNotifications(@CurrentUser('id') userId: number) {
    return this.notificationsService.getUserNotifications(userId);
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'My notifications, newest first',
    description: 'data: { items: Notification[]; nextCursor }',
  })
  @ApiResponse({ status: 200, description: 'Notifications' })
  async list(
    @CurrentUser('id') userId: number,
    @Query() q: CursorQueryDto,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(
      await this.notificationsService.list(
        userId,
        q.cursor,
        pageLimit(q.limit),
        baseUrl,
      ),
    );
  }

  @Get('notifications/unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Unread notifications',
    description: 'data: { count }',
  })
  @ApiResponse({ status: 200, description: 'Count' })
  async unreadCount(@CurrentUser('id') userId: number) {
    return ok({ count: await this.notificationsService.countUnread(userId) });
  }

  @Post('notifications/read')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Mark notifications read',
    description:
      'Body { ids: string[] } or { all: true }. data: { count } = unread after',
  })
  @ApiResponse({ status: 200, description: 'Unread count after' })
  async markRead(@CurrentUser('id') userId: number, @Body() body: MarkReadDto) {
    if (!body.all && !body.ids?.length) {
      throw new BadRequestException('Send ids or all: true');
    }
    return ok({
      count: await this.notificationsService.markRead(userId, body),
    });
  }

  @Post('device-tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Register this device for push (upsert)',
    description:
      'Moves the token to the caller if another user owned it. data: { ok: true }',
  })
  @ApiResponse({ status: 201, description: 'Registered' })
  async registerDeviceToken(
    @CurrentUser('id') userId: number,
    @Body() body: RegisterDeviceTokenDto,
  ) {
    await this.deviceTokens.register(
      userId,
      body.token,
      body.platform,
      body.appVersion ?? null,
    );
    return ok({ ok: true });
  }

  @Delete('device-tokens/:token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Remove a device token (logout)',
    description: "Only removes the caller's own token. data: { ok: true }",
  })
  @ApiParam({ name: 'token', description: 'FCM registration token' })
  @ApiResponse({ status: 200, description: 'Removed (or already gone)' })
  async removeDeviceToken(
    @CurrentUser('id') userId: number,
    @Param('token') token: string,
  ) {
    await this.deviceTokens.remove(userId, token);
    return ok({ ok: true });
  }

  @Post('update-device-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update device token for push notifications (legacy)',
    description: 'Kept for old builds; writes to device_tokens too.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Device token updated successfully',
  })
  async updateDeviceToken(
    @CurrentUser('id') userId: number,
    // Plain object on purpose: old builds may send extra fields, which a
    // whitelisting DTO would reject.
    @Body() body: { device_token?: string; fcm_token?: string },
  ) {
    const raw = body?.device_token || body?.fcm_token;
    const deviceToken = typeof raw === 'string' ? raw.trim() : '';

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

    // users.device_token stays in sync until the column is dropped.
    await this.userRepository.update(userId, { device_token: deviceToken });
    await this.deviceTokens.register(userId, deviceToken);

    return {
      success: true,
      message: 'Device token updated successfully',
    };
  }
}
