import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushOutbox } from '../../entities/push-outbox.entity';
import { Notification } from '../../entities/notification.entity';
import { UserSetting } from '../../entities/user-setting.entity';
import { FcmService } from '../fcm.service';
import { DeviceTokensService } from '../device-tokens.service';
import { buildFcmMessage } from './push-message';

export interface PushSendOutcome {
  status: 'sent' | 'skipped';
  detail?: string;
}

/**
 * Sends one outbox job to every device of its user. Throws when nothing was
 * delivered for a reason that may pass (FCM unreachable, quota, internal
 * error) so the worker retries; dead tokens are deleted on the spot.
 */
@Injectable()
export class PushSender {
  constructor(
    private readonly fcm: FcmService,
    private readonly deviceTokens: DeviceTokensService,
    @InjectRepository(UserSetting)
    private readonly settings: Repository<UserSetting>,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  async send(job: PushOutbox): Promise<PushSendOutcome> {
    // Checked again here: the user may have turned pushes off since.
    const setting = await this.settings.findOne({
      select: { id: true, notifications_enabled: true },
      where: { user_id: job.user_id },
    });
    if (setting && setting.notifications_enabled === false) {
      return { status: 'skipped', detail: 'notifications disabled' };
    }

    const tokens = await this.deviceTokens.tokensFor(job.user_id);
    if (!tokens.length)
      return { status: 'skipped', detail: 'no device tokens' };
    if (!this.fcm.enabled) {
      return { status: 'skipped', detail: 'firebase not configured' };
    }

    const badge = await this.notifications.count({
      where: { user_id: job.user_id, is_read: false },
    });
    const result = await this.fcm.sendMulticast(
      tokens,
      buildFcmMessage(job.type, job.payload, badge),
    );
    if (result.deadTokens.length) {
      await this.deviceTokens.removeDeadTokens(result.deadTokens);
    }

    if (result.successCount > 0) {
      return {
        status: 'sent',
        detail: result.failureCount
          ? `${result.successCount}/${tokens.length} delivered`
          : undefined,
      };
    }
    if (result.errors.length) {
      throw new Error(`FCM failed: ${[...new Set(result.errors)].join(', ')}`);
    }
    return { status: 'skipped', detail: 'all device tokens were invalid' };
  }
}
