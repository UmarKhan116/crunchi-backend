import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'crypto';
import { SocialTokenVerifier } from './social-token-verifier.service';
import { AuthService } from '../auth.service';

function configWith(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const ENV = {
  GOOGLE_CLIENT_IDS:
    'web-client.apps.googleusercontent.com, ios-client.apps.googleusercontent.com',
  APPLE_BUNDLE_ID: 'com.crunchii.app',
  FACEBOOK_APP_ID: '1234',
  FACEBOOK_APP_SECRET: 'fb-secret',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('SocialTokenVerifier', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new Error('unexpected network call');
    });
  });
  afterEach(() => jest.restoreAllMocks());

  describe('Google', () => {
    it('returns the verified identity for a valid idToken', async () => {
      const verifier = new SocialTokenVerifier(configWith(ENV));
      const spy = jest
        .spyOn(verifier.googleClient as any, 'verifyIdToken')
        .mockResolvedValue({
          getPayload: () => ({
            sub: 'g-123',
            email: 'Ann@Example.com',
            email_verified: true,
            name: 'Ann',
          }),
        } as any);

      const identity = await verifier.verify('google', { idToken: 'tok' });

      expect(spy).toHaveBeenCalledWith({
        idToken: 'tok',
        audience: [
          'web-client.apps.googleusercontent.com',
          'ios-client.apps.googleusercontent.com',
        ],
      });
      expect(identity).toEqual({
        provider: 'google',
        subject: 'g-123',
        email: 'ann@example.com',
        emailVerified: true,
        name: 'Ann',
      });
    });

    it('rejects an invalid idToken with 401', async () => {
      const verifier = new SocialTokenVerifier(configWith(ENV));
      jest
        .spyOn(verifier.googleClient as any, 'verifyIdToken')
        .mockRejectedValue(
          new Error('Wrong recipient, payload audience != requiredAudience'),
        );
      await expect(
        verifier.verify('google', { idToken: 'bad' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('fails closed with 503 when GOOGLE_CLIENT_IDS is unset', async () => {
      const verifier = new SocialTokenVerifier(configWith({}));
      await expect(
        verifier.verify('google', { idToken: 'tok' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('requires the idToken', async () => {
      const verifier = new SocialTokenVerifier(configWith(ENV));
      await expect(verifier.verify('google', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('Apple', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const jwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid: 'apple-kid',
      alg: 'RS256',
      use: 'sig',
    };
    const otherKey = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    }).privateKey;
    const signer = new JwtService({});

    const appleToken = (claims: object, key = privateKey, kid = 'apple-kid') =>
      signer.sign(
        {
          iss: 'https://appleid.apple.com',
          aud: 'com.crunchii.app',
          sub: '001234.abcdef.0001',
          email: 'x@privaterelay.appleid.com',
          email_verified: 'true',
          ...claims,
        },
        {
          algorithm: 'RS256',
          privateKey: key.export({ type: 'pkcs8', format: 'pem' }).toString(),
          keyid: kid,
          expiresIn: '5m',
        },
      );

    beforeEach(() => {
      fetchMock.mockImplementation(async (url: string) => {
        expect(url).toBe('https://appleid.apple.com/auth/keys');
        return jsonResponse({ keys: [jwk] });
      });
    });

    it('accepts a token signed by an Apple JWKS key for our bundle id', async () => {
      const verifier = new SocialTokenVerifier(configWith(ENV));
      const identity = await verifier.verify('apple', {
        identityToken: appleToken({}),
      });
      expect(identity).toEqual({
        provider: 'apple',
        subject: '001234.abcdef.0001',
        email: 'x@privaterelay.appleid.com',
        emailVerified: true,
        name: null,
      });
    });

    it('caches the JWKS between logins', async () => {
      const verifier = new SocialTokenVerifier(configWith(ENV));
      await verifier.verify('apple', { identityToken: appleToken({}) });
      await verifier.verify('apple', { identityToken: appleToken({}) });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['another audience', () => appleToken({ aud: 'com.someone.else' })],
      ['another issuer', () => appleToken({ iss: 'https://evil.example' })],
      ['a key Apple did not publish', () => appleToken({}, otherKey)],
      ['an unknown kid', () => appleToken({}, privateKey, 'unknown-kid')],
      [
        'an expired token',
        () => appleToken({ exp: Math.floor(Date.now() / 1000) - 10 }),
      ],
    ])('rejects %s with 401', async (_label, make) => {
      const verifier = new SocialTokenVerifier(configWith(ENV));
      let token: string;
      try {
        token = make();
      } catch {
        // jsonwebtoken refuses to sign exp + expiresIn; build that one manually
        token = signer.sign(
          {
            iss: 'https://appleid.apple.com',
            aud: 'com.crunchii.app',
            sub: 's',
            exp: Math.floor(Date.now() / 1000) - 10,
          },
          {
            algorithm: 'RS256',
            privateKey: privateKey
              .export({ type: 'pkcs8', format: 'pem' })
              .toString(),
            keyid: 'apple-kid',
          },
        );
      }
      await expect(
        verifier.verify('apple', { identityToken: token }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('treats email_verified "false" as unverified', async () => {
      const verifier = new SocialTokenVerifier(configWith(ENV));
      const identity = await verifier.verify('apple', {
        identityToken: appleToken({ email_verified: 'false' }),
      });
      expect(identity.emailVerified).toBe(false);
    });
  });

  describe('Facebook', () => {
    it('verifies via debug_token for our app id', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/debug_token')) {
          expect(url).toContain('input_token=user-token');
          expect(url).toContain(
            `access_token=${encodeURIComponent('1234|fb-secret')}`,
          );
          return jsonResponse({
            data: { is_valid: true, app_id: '1234', user_id: 'fb-77' },
          });
        }
        return jsonResponse({
          id: 'fb-77',
          name: 'Fay',
          email: 'fay@example.com',
        });
      });
      const verifier = new SocialTokenVerifier(configWith(ENV));
      const identity = await verifier.verify('facebook', {
        accessToken: 'user-token',
      });
      expect(identity).toEqual({
        provider: 'facebook',
        subject: 'fb-77',
        email: 'fay@example.com',
        emailVerified: true,
        name: 'Fay',
      });
    });

    it('rejects a token issued to another app', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: { is_valid: true, app_id: '9999', user_id: 'fb-77' },
        }),
      );
      const verifier = new SocialTokenVerifier(configWith(ENV));
      await expect(
        verifier.verify('facebook', { accessToken: 'user-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an invalid token', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: { is_valid: false } }));
      const verifier = new SocialTokenVerifier(configWith(ENV));
      await expect(
        verifier.verify('facebook', { accessToken: 'user-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('rejects an unknown provider', async () => {
    const verifier = new SocialTokenVerifier(configWith(ENV));
    await expect(
      verifier.verify('myspace', { idToken: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthService.socialLogin', () => {
  type Row = Record<string, any>;
  let users: Row[];
  let verifier: { verify: jest.Mock };

  const userRepository = {
    findOne: jest.fn(
      async ({ where }: any) =>
        users.find((u) =>
          Object.entries(where).every(([k, v]) => u[k] === v),
        ) ?? null,
    ),
    createQueryBuilder: jest.fn(() => {
      let email: string;
      const qb: any = {
        where: (_: string, params: any) => {
          email = params.email.toLowerCase();
          return qb;
        },
        getOne: async () =>
          users.find((u) => u.email.toLowerCase() === email) ?? null,
      };
      return qb;
    }),
    create: jest.fn((data: Row) => ({ ...data })),
    save: jest.fn(async (row: Row) => {
      if (!row.id) {
        row.id = users.length + 1;
        users.push(row);
      }
      return row;
    }),
  };

  function service(env: Record<string, string | undefined> = {}) {
    return new AuthService(
      userRepository as any,
      {} as any,
      new JwtService({ secret: 'test' }),
      verifier as any,
      configWith(env),
    );
  }

  beforeEach(() => {
    users = [];
    verifier = { verify: jest.fn() };
    jest.clearAllMocks();
  });

  describe('legacy body (social_id, no token)', () => {
    const legacyBody = {
      provider: 'google',
      social_id: 'g-1',
      email: 'a@b.com',
      name: 'A',
    };

    it('still works when ALLOW_LEGACY_SOCIAL_LOGIN is unset (default true)', async () => {
      const res: any = await service({}).socialLogin(legacyBody as any);
      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();
      expect(verifier.verify).not.toHaveBeenCalled();
    });

    it('still works when ALLOW_LEGACY_SOCIAL_LOGIN=true', async () => {
      const res: any = await service({
        ALLOW_LEGACY_SOCIAL_LOGIN: 'true',
      }).socialLogin(legacyBody as any);
      expect(res.success).toBe(true);
    });

    it.each(['false', '0', 'no'])(
      'is rejected with 400 when ALLOW_LEGACY_SOCIAL_LOGIN=%s',
      async (flag) => {
        await expect(
          service({ ALLOW_LEGACY_SOCIAL_LOGIN: flag }).socialLogin(
            legacyBody as any,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(users).toHaveLength(0);
      },
    );
  });

  describe('verified body', () => {
    const identity = {
      provider: 'google',
      subject: 'g-sub',
      email: 'ann@example.com',
      emailVerified: true,
      name: 'Ann',
    };

    it('creates a user keyed on the verified subject, ignoring any client social_id', async () => {
      verifier.verify.mockResolvedValue(identity);
      const res: any = await service({
        ALLOW_LEGACY_SOCIAL_LOGIN: 'false',
      }).socialLogin({
        provider: 'google',
        idToken: 'tok',
        social_id: 'spoofed',
        deviceToken: 'fcm-1',
      } as any);
      expect(res.isNewUser).toBe(true);
      expect(users[0]).toMatchObject({
        social_id: 'g-sub',
        social_provider: 'google',
        email: 'ann@example.com',
        device_token: 'fcm-1',
      });
      expect(res.user.password).toBeUndefined();
    });

    it('logs an existing linked user back in', async () => {
      users.push({
        id: 1,
        email: 'ann@example.com',
        social_id: 'g-sub',
        social_provider: 'google',
        is_active: true,
      });
      verifier.verify.mockResolvedValue(identity);
      const res: any = await service().socialLogin({
        provider: 'google',
        idToken: 'tok',
      } as any);
      expect(res.isNewUser).toBe(false);
      expect(res.user.id).toBe(1);
    });

    it('links to an existing email account when the provider verified the email', async () => {
      users.push({ id: 1, email: 'Ann@Example.com', is_active: true });
      verifier.verify.mockResolvedValue(identity);
      const res: any = await service().socialLogin({
        provider: 'google',
        idToken: 'tok',
      } as any);
      expect(res.user.id).toBe(1);
      expect(users[0].social_id).toBe('g-sub');
    });

    it('refuses to link when the email is not verified (409)', async () => {
      users.push({ id: 1, email: 'ann@example.com', is_active: true });
      verifier.verify.mockResolvedValue({ ...identity, emailVerified: false });
      await expect(
        service().socialLogin({ provider: 'google', idToken: 'tok' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users[0].social_id).toBeUndefined();
    });

    it('creates an account with a placeholder email when the provider hides it', async () => {
      verifier.verify.mockResolvedValue({
        ...identity,
        provider: 'apple',
        subject: 'a.1',
        email: null,
      });
      await service().socialLogin({
        provider: 'apple',
        identityToken: 'tok',
        fullName: 'Al',
      } as any);
      expect(users[0].email).toBe('apple_a.1@social.crunchii.invalid');
      expect(users[0].full_name).toBe('Al');
    });

    it('propagates a 401 from the verifier and creates nothing', async () => {
      verifier.verify.mockRejectedValue(
        new UnauthorizedException('Invalid Google token'),
      );
      await expect(
        service().socialLogin({ provider: 'google', idToken: 'bad' } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users).toHaveLength(0);
    });
  });
});
