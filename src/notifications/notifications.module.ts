import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmService } from './fcm.service';
import { DeviceTokensService } from './device-tokens.service';
import { OutboxPushProducer } from './push/outbox-push.producer';
import { PushSender } from './push/push-sender.service';
import { PushOutboxWorker } from './push/push-outbox.worker';
import { PUSH_PRODUCER } from './push/push.types';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { DeviceToken } from '../entities/device-token.entity';
import { PushOutbox } from '../entities/push-outbox.entity';
import { Post } from '../entities/post.entity';

/**
 * Notifications and push (WS7): device tokens, the push_outbox queue and its
 * worker. Other modules create notifications through NotificationsService
 * and can queue raw pushes through PUSH_PRODUCER.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      User,
      UserSetting,
      DeviceToken,
      PushOutbox,
      Post,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    FcmService,
    DeviceTokensService,
    PushSender,
    PushOutboxWorker,
    { provide: PUSH_PRODUCER, useClass: OutboxPushProducer },
  ],
  exports: [
    NotificationsService,
    FcmService,
    DeviceTokensService,
    PUSH_PRODUCER,
  ],
})
export class NotificationsModule {}
