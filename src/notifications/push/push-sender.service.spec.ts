import { PushSender } from './push-sender.service';

const job: any = {
  id: 5,
  user_id: 7,
  type: 'comment',
  attempts: 1,
  payload: {
    title: 'Crunchii',
    body: 'Bob commented on your post',
    data: {
      type: 'comment',
      notificationId: '12',
      postId: '45',
      userId: '3',
      link: '/p/45',
    },
  },
};

describe('PushSender', () => {
  let fcm: any;
  let deviceTokens: any;
  let settings: any;
  let notifications: any;
  let sender: PushSender;

  beforeEach(() => {
    fcm = {
      enabled: true,
      sendMulticast: jest.fn().mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        deadTokens: [],
        errors: [],
      }),
    };
    deviceTokens = {
      tokensFor: jest.fn().mockResolvedValue(['tok-a', 'tok-b']),
      removeDeadTokens: jest.fn().mockResolvedValue(undefined),
    };
    settings = { findOne: jest.fn().mockResolvedValue(null) };
    notifications = { count: jest.fn().mockResolvedValue(4) };
    sender = new PushSender(fcm, deviceTokens, settings, notifications);
  });

  it('sends to every token with string data, the activity channel and the real unread badge', async () => {
    expect(await sender.send(job)).toEqual({
      status: 'sent',
      detail: undefined,
    });
    const [tokens, message] = fcm.sendMulticast.mock.calls[0];
    expect(tokens).toEqual(['tok-a', 'tok-b']);
    expect(message.notification).toEqual({
      title: 'Crunchii',
      body: 'Bob commented on your post',
    });
    expect(message.data).toEqual(job.payload.data);
    expect(
      Object.values(message.data).every((v) => typeof v === 'string'),
    ).toBe(true);
    expect(message.android.notification.channelId).toBe('activity');
    expect(message.apns.payload.aps.badge).toBe(4);
    expect(notifications.count).toHaveBeenCalledWith({
      where: { user_id: 7, is_read: false },
    });
  });

  it('uses the promotions channel for broadcasts', async () => {
    await sender.send({ ...job, type: 'broadcast' });
    expect(
      fcm.sendMulticast.mock.calls[0][1].android.notification.channelId,
    ).toBe('promotions');
  });

  it('deletes tokens FCM reports as unregistered or invalid', async () => {
    fcm.sendMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 2,
      deadTokens: ['tok-b', 'tok-c'],
      errors: [],
    });
    const outcome = await sender.send(job);
    expect(deviceTokens.removeDeadTokens).toHaveBeenCalledWith([
      'tok-b',
      'tok-c',
    ]);
    expect(outcome.status).toBe('sent');
  });

  it('skips (no retry) when every token was dead', async () => {
    fcm.sendMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      deadTokens: ['tok-a', 'tok-b'],
      errors: [],
    });
    expect(await sender.send(job)).toEqual({
      status: 'skipped',
      detail: 'all device tokens were invalid',
    });
    expect(deviceTokens.removeDeadTokens).toHaveBeenCalled();
  });

  it('throws so the worker retries when nothing was delivered for a temporary reason', async () => {
    fcm.sendMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      deadTokens: [],
      errors: ['messaging/internal-error', 'messaging/internal-error'],
    });
    await expect(sender.send(job)).rejects.toThrow(
      'FCM failed: messaging/internal-error',
    );
  });

  it('skips users who turned notifications off', async () => {
    settings.findOne.mockResolvedValue({ id: 1, notifications_enabled: false });
    expect((await sender.send(job)).status).toBe('skipped');
    expect(fcm.sendMulticast).not.toHaveBeenCalled();
  });

  it('skips users without devices, and when Firebase is not configured', async () => {
    deviceTokens.tokensFor.mockResolvedValueOnce([]);
    expect(await sender.send(job)).toEqual({
      status: 'skipped',
      detail: 'no device tokens',
    });
    fcm.enabled = false;
    expect((await sender.send(job)).detail).toBe('firebase not configured');
    expect(fcm.sendMulticast).not.toHaveBeenCalled();
  });
});
