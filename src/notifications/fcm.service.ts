import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private app: admin.app.App | null = null;

  onModuleInit() {
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      try {
        // Try to initialize with service account from environment
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
        
        if (serviceAccount) {
          const serviceAccountJson = JSON.parse(serviceAccount);
          this.app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccountJson),
          });
          console.log('✅ Firebase Admin initialized with service account');
        } else {
          // Try to initialize with default credentials (for Google Cloud environments)
          try {
            this.app = admin.initializeApp({
              credential: admin.credential.applicationDefault(),
            });
            console.log('✅ Firebase Admin initialized with default credentials');
          } catch (defaultError) {
            console.warn('⚠️ Firebase Admin not initialized - push notifications disabled');
            console.warn('Set FIREBASE_SERVICE_ACCOUNT environment variable to enable');
          }
        }
      } catch (error) {
        console.error('❌ Firebase Admin initialization error:', error);
        console.warn('⚠️ Push notifications will not work without Firebase credentials');
      }
    } else {
      this.app = admin.app();
      console.log('✅ Firebase Admin already initialized');
    }
  }

  async sendNotification(
    deviceToken: string,
    notification: {
      title: string;
      body: string;
      data?: any;
    },
  ): Promise<void> {
    if (!this.app) {
      console.warn('⚠️ Firebase Admin not initialized, skipping push notification');
      console.warn('⚠️ Check FIREBASE_SERVICE_ACCOUNT in .env file');
      return;
    }

    if (!deviceToken || deviceToken.trim() === '') {
      console.warn('⚠️ Empty device token provided, skipping push notification');
      return;
    }

    try {
      console.log(
        '📤 Attempting to send FCM notification to token:',
        deviceToken.substring(0, 20) + '...',
      );

      const message: admin.messaging.Message = {
        token: deviceToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data
          ? Object.keys(notification.data).reduce((acc, key) => {
              acc[key] = String(notification.data[key]);
              return acc;
            }, {} as Record<string, string>)
          : undefined,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'channel-id',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('✅ Successfully sent push notification:', response);
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);

      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        console.log('⚠️ Invalid or unregistered token - token may be expired');
      } else if (error.code === 'messaging/invalid-argument') {
        console.log('⚠️ Invalid argument - check notification payload');
      }
    }
  }

  async sendNotificationToMultiple(
    deviceTokens: string[],
    notification: {
      title: string;
      body: string;
      data?: any;
    },
  ): Promise<void> {
    if (!this.app) {
      console.warn('⚠️ Firebase Admin not initialized, skipping push notification');
      return;
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.warn('⚠️ No device tokens provided, skipping push notification');
      return;
    }

    // Filter out empty tokens
    const validTokens = deviceTokens.filter((token) => token && token.trim() !== '');
    if (validTokens.length === 0) {
      console.warn('⚠️ No valid device tokens found, skipping push notification');
      return;
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: validTokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data
          ? Object.keys(notification.data).reduce((acc, key) => {
              acc[key] = String(notification.data[key]);
              return acc;
            }, {} as Record<string, string>)
          : undefined,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'channel-id',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Successfully sent ${response.successCount} push notifications`);
      if (response.failureCount > 0) {
        console.log(`Failed to send ${response.failureCount} push notifications`);
      }
    } catch (error) {
      console.error('Error sending multicast push notification:', error);
    }
  }
}

