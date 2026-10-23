import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { toPublicUser, toSafeUser } from '../common/utils/user-sanitizer';
import { buildMediaUrl } from '../common/utils/public-url';
import { decodeCursor, encodeCursor } from '../common/utils/cursor';
import { Paginated } from '../common/http/api-envelope';
import {
  ContractNotification,
  NotificationType,
} from '../common/contract/types';
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
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
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

  /** GET /api/notifications: newest first, keyset cursor on id. */
  async list(
    userId: number,
    cursor: string | undefined,
    limit: number,
    baseUrl: string,
  ): Promise<Paginated<ContractNotification>> {
    const state = decodeCursor<{ before: number }>(
      cursor,
      (c): c is { before: number } =>
        c && Number.isInteger(c.before) && c.before > 0,
    );
    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.id', 'DESC')
      .take(limit + 1);
    if (state) qb.andWhere('n.id < :before', { before: state.before });
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);

    const actorIds = [
      ...new Set(page.map((n) => n.actor_user_id).filter(Boolean)),
    ];
    const postIds = [
      ...new Set(
        page
          .map((n) => Number(n.data?.post_id ?? n.data?.postId))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const [actors, posts]: [User[], Post[]] = await Promise.all([
      actorIds.length
        ? this.userRepository.find({
            select: {
              id: true,
              user_name: true,
              full_name: true,
              profile_picture: true,
            },
            where: { id: In(actorIds) },
          })
        : [],
      postIds.length
        ? this.postRepository.find({
            select: { id: true, images: true },
            where: { id: In(postIds) },
          })
        : [],
    ]);
    const actorById = new Map<number, User>(actors.map((u) => [u.id, u]));
    const postById = new Map<number, Post>(posts.map((p) => [p.id, p]));

    const items = page.map((n): ContractNotification => {
      const data = n.data ?? {};
      const postId = data.post_id ?? data.postId ?? null;
      const placeId = data.place_id ?? data.placeId ?? null;
      const actor = n.actor_user_id ? actorById.get(n.actor_user_id) : null;
      const publicActor = actor ? toPublicUser(actor, baseUrl) : null;
      const postImage = postId
        ? firstImage(postById.get(Number(postId))?.images)
        : null;
      return {
        id: String(n.id),
        type: n.type as NotificationType,
        message: n.message,
        actor: publicActor,
        postId: postId !== null ? String(postId) : null,
        placeId: placeId !== null ? String(placeId) : null,
        link:
          data.link ??
          linkFor(n.type, { postId, placeId, userId: n.actor_user_id }),
        isRead: n.is_read,
        createdAt: new Date(n.created_at).toISOString(),
        thumbnailUrl: postImage
          ? buildMediaUrl(baseUrl, '', postImage)
          : (publicActor?.avatarUrl ?? null),
      };
    });

    return {
      items,
      nextCursor:
        rows.length > limit
          ? encodeCursor({ before: page[page.length - 1].id })
          : null,
    };
  }

  /** POST /api/notifications/read: the caller's own rows only. */
  async markRead(
    userId: number,
    target: { ids?: string[]; all?: boolean },
  ): Promise<number> {
    if (target.all) {
      await this.notificationRepository.update(
        { user_id: userId, is_read: false },
        { is_read: true },
      );
    } else if (target.ids?.length) {
      await this.notificationRepository.update(
        { user_id: userId, id: In(target.ids.map(Number)), is_read: false },
        { is_read: true },
      );
    }
    return this.countUnread(userId);
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

const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm|m4v)(\?|$)/i;

/** First photo of a post (videos have no thumbnail yet). */
function firstImage(images: string[] | null | undefined): string | null {
  if (!Array.isArray(images)) return null;
  return (
    images.find((f) => typeof f === 'string' && f && !VIDEO_EXTENSIONS.test(f)) ??
    null
  );
}
