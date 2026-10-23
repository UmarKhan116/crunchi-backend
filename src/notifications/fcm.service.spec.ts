const sendEachForMulticast = jest.fn();
const fakeApp = { messaging: () => ({ sendEachForMulticast }) };

// Never talk to Firebase from tests.
jest.mock('firebase-admin', () => ({
  apps: [],
  app: jest.fn(() => fakeApp),
  initializeApp: jest.fn(() => fakeApp),
  credential: {
    cert: jest.fn(() => 'cert'),
    applicationDefault: jest.fn(() => 'default'),
  },
}));

import * as admin from 'firebase-admin';
import { FcmService } from './fcm.service';

describe('FcmService.sendMulticast', () => {
  let fcm: FcmService;

  beforeEach(() => {
    sendEachForMulticast.mockReset();
    fcm = new FcmService();
    fcm.onModuleInit();
  });

  it('initialises once with default credentials when no service account is set', () => {
    expect(admin.initializeApp).toHaveBeenCalled();
    expect(fcm.enabled).toBe(true);
  });

  it('sends to all tokens and sorts failures into dead tokens and other errors', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        {
          success: false,
          error: { code: 'messaging/invalid-registration-token' },
        },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    const result = await fcm.sendMulticast(['a', 'b', 'c', 'd', 'a', ''], {
      notification: { title: 't', body: 'b' },
    });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(result).toEqual({
      successCount: 1,
      failureCount: 3,
      deadTokens: ['b', 'c'],
      errors: ['messaging/internal-error'],
    });
  });

  it('splits more than 500 tokens into several calls', async () => {
    sendEachForMulticast.mockImplementation(async ({ tokens }) => ({
      responses: tokens.map(() => ({ success: true })),
    }));
    const tokens = Array.from({ length: 1201 }, (_, i) => `t${i}`);
    const result = await fcm.sendMulticast(tokens, {});
    expect(
      sendEachForMulticast.mock.calls.map(([m]) => m.tokens.length),
    ).toEqual([500, 500, 201]);
    expect(result.successCount).toBe(1201);
  });

  it('throws when FCM cannot be reached (the worker retries)', async () => {
    sendEachForMulticast.mockRejectedValue(new Error('ECONNRESET'));
    await expect(fcm.sendMulticast(['a'], {})).rejects.toThrow('ECONNRESET');
  });
});
