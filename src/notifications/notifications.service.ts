import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { FcmService } from './fcm.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly fcmService: FcmService,
  ) {}

  async getUserNotifications(userId?: number) {
    try {
      const notifications = await this.notificationRepository.find({
        where: { user_id: userId },
        relations: ['user'],
        order: { created_at: 'DESC' },
        take: 100,
      });

      // Get actor users for notifications that have actor_user_id
      const actorUserIds = notifications
        .filter((n) => n.actor_user_id)
        .map((n) => n.actor_user_id);

      let actorUsers = {};
      if (actorUserIds.length > 0) {
        const uniqueActorIds = [...new Set(actorUserIds)];
        const users = await this.userRepository.find({
          where: uniqueActorIds.map((id) => ({ id })),
        });
        actorUsers = users.reduce((acc, user) => {
          acc[user.id] = {
            ...user,
            image: user.profile_picture,
          };
          return acc;
        }, {});
      }

      // Transform notifications to include user image field and actor user for frontend compatibility
      const transformedNotifications = notifications.map((notification: any) => {
        // Set recipient user image (the user who receives the notification)
        if (notification.user) {
          notification.user.image = notification.user.profile_picture;
        }
        // Add actor user (the user who performed the action) if exists
        if (notification.actor_user_id && actorUsers[notification.actor_user_id]) {
          notification.actor_user = actorUsers[notification.actor_user_id];
        }
        return notification;
      });

      return {
        success: true,
        message: 'Notifications retrieved successfully',
        data: transformedNotifications,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get notifications: ' + error.message,
        data: [],
      };
    }
  }

  async createNotification(
    userId: number,
    type: string,
    message: string,
    data?: any,
    actorUserId?: number,
  ) {
    try {
      const notification = this.notificationRepository.create({
        user_id: userId,
        type,
        message,
        data,
        actor_user_id: actorUserId || null,
      });

      await this.notificationRepository.save(notification);

      // Send push notification if user has device token
      await this.sendPushNotification(userId, message, type, data);

      return {
        success: true,
        message: 'Notification created successfully',
      };
    } catch (error) {
      console.error('Failed to create notification:', error);
      return {
        success: false,
        message: 'Failed to create notification: ' + error.message,
      };
    }
  }

  private async sendPushNotification(
    userId: number,
    message: string,
    type: string,
    data?: any,
  ) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user || !user.device_token) {
        console.log(`No device token found for user ${userId}`);
        return;
      }

      await this.fcmService.sendNotification(user.device_token, {
        title: 'Crunchy',
        body: message,
        data: {
          type,
          ...data,
        },
      });
    } catch (error) {
      console.error('Failed to send push notification:', error);
      // Don't throw error, just log it
    }
  }
}
