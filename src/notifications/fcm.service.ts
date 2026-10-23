import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

/** FCM error codes meaning the token will never work again: delete it. */
export const DEAD_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** sendEachForMulticast accepts at most 500 tokens per call. */
const MULTICAST_LIMIT = 500;

export type FcmMessage = Omit<admin.messaging.MulticastMessage, 'tokens'>;

export interface FcmSendResult {
  successCount: number;
  failureCount: number;
  /** Tokens FCM rejected as unregistered or invalid. */
  deadTokens: string[];
  /** Error codes of the other (possibly temporary) failures. */
  errors: string[];
}

/**
 * Thin wrapper over firebase-admin messaging. Only PushSender calls it, from
 * the outbox worker, never from a request.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: admin.app.App | null = null;

  onModuleInit() {
    if (admin.apps.length) {
      this.app = admin.app();
      return;
    }
    try {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      this.app = admin.initializeApp({
        credential: serviceAccount
          ? admin.credential.cert(JSON.parse(serviceAccount))
          : // Google Cloud environments provide default credentials.
            admin.credential.applicationDefault(),
      });
      this.logger.log(
        `Firebase Admin initialised (${serviceAccount ? 'service account' : 'default credentials'})`,
      );
    } catch (error) {
      this.app = null;
      this.logger.warn(
        `Firebase Admin not initialised, push disabled: ${error?.message}. ` +
          'Set FIREBASE_SERVICE_ACCOUNT to enable it.',
      );
    }
  }

  get enabled(): boolean {
    return !!this.app;
  }

  /**
   * Sends one message to every token (chunks of 500). Throws only when FCM
   * cannot be reached at all; per-token failures are reported in the result.
   */
  async sendMulticast(
    tokens: string[],
    message: FcmMessage,
  ): Promise<FcmSendResult> {
    const result: FcmSendResult = {
      successCount: 0,
      failureCount: 0,
      deadTokens: [],
      errors: [],
    };
    if (!this.app) throw new Error('Firebase Admin is not initialised');
    const valid = [...new Set(tokens.filter((t) => t && t.trim()))];
    for (let i = 0; i < valid.length; i += MULTICAST_LIMIT) {
      const chunk = valid.slice(i, i + MULTICAST_LIMIT);
      const batch = await this.app
        .messaging()
        .sendEachForMulticast({ ...message, tokens: chunk });
      batch.responses.forEach((response, index) => {
        if (response.success) {
          result.successCount++;
          return;
        }
        result.failureCount++;
        const code = response.error?.code ?? 'unknown';
        if (DEAD_TOKEN_ERRORS.has(code)) result.deadTokens.push(chunk[index]);
        else result.errors.push(code);
      });
    }
    return result;
  }
}
