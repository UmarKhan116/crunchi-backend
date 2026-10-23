import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { toSafeUser } from '../common/utils/user-sanitizer';
import { PUSH_PRODUCER, PushProducer, PushType } from './push/push.types';
import { linkFor } from './push/push-message';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    @Inject(PUSH_PRODUCER)
    private readonly push: PushProducer,
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
          // The actor is someone else: public fields (+ legacy `image`) only.
          acc[user.id] = toSafeUser(user);
          return acc;
        }, {});
      }

      // Transform notifications to include user image field and actor user for frontend compatibility
      const transformedNotifications = notifications.map((notification: any) => {
        // Set recipient user image (the user who receives the notification)
        if (notification.user) {
          // Remove sensitive fields from notification.user
          delete notification.user.password;
          delete notification.user.reset_password_token;
          delete notification.user.reset_password_expires;
          // Map profile_picture to image
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

  async countUnread(userId: number): Promise<number> {
    return this.notificationRepository.count({
      where: { user_id: userId, is_read: false },
    });
  }

  /**
   * Saves the notification and queues its push in one transaction, then
   * returns; PushOutboxWorker sends it. Never notifies the actor themselves.
   * `data` keeps the legacy snake_case keys (post_id, actor_user_id, ...)
   * that getUserNotification and old builds read; the contract fields and
   * `link` are added here.
   */
  async createNotification(
    userId: number,
    type: string,
    message: string,
    data?: any,
    actorUserId?: number,
  ) {
    if (actorUserId && Number(actorUserId) === Number(userId)) {
      return { success: true, message: 'Notification skipped (self)' };
    }
    try {
      const postId = data?.post_id ?? null;
      const placeId = data?.place_id ?? null;
      const link =
        data?.link ??
        linkFor(type, { postId, placeId, userId: actorUserId ?? null });
      const stored = { ...(data ?? {}), ...(link ? { link } : {}) };

      await this.dataSource.transaction(async (em) => {
        const notification = await em.save(
          em.create(Notification, {
            user_id: userId,
            type,
            message,
            data: stored,
            actor_user_id: actorUserId || null,
          }),
        );
        await this.push.enqueue(
          {
            userId,
            type: type as PushType,
            body: message,
            data: {
              ...stored,
              notificationId: notification.id,
              postId,
              userId: actorUserId ?? null,
              placeId,
              link,
            },
          },
          em,
        );
      });

      return {
        success: true,
        message: 'Notification created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create notification: ${error?.message}`);
      return {
        success: false,
        message: 'Failed to create notification: ' + error.message,
      };
    }
  }
}
