import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { createPublicKey } from 'crypto';

export type SocialProvider = 'google' | 'apple' | 'facebook';
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  'google',
  'apple',
  'facebook',
];

/** The identity a provider vouched for. Only `subject` is trusted for matching. */
export interface VerifiedSocialIdentity {
  provider: SocialProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface SocialTokens {
  idToken?: string;
  identityToken?: string;
  accessToken?: string;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const JWKS_TTL_MS = 6 * 60 * 60 * 1000;
const FACEBOOK_GRAPH = 'https://graph.facebook.com';
// Limited Login (iOS) OIDC token. The discovery document at
// https://limited.facebook.com/.well-known/openid-configuration/ names this
// issuer only; the JWKS URL is the one Facebook's Limited Login docs give.
const FACEBOOK_OIDC_ISSUER = 'https://www.facebook.com';
const FACEBOOK_JWKS_URL =
  'https://limited.facebook.com/.well-known/oauth/openid/jwks/';

/**
 * Verifies social sign-in tokens on the server (POST /api/socialLogin).
 *  - Google: `idToken` signature + audience in GOOGLE_CLIENT_IDS.
 *  - Apple: `identityToken` against Apple's JWKS, audience APPLE_BUNDLE_ID.
 *  - Facebook: `accessToken` via debug_token with FACEBOOK_APP_ID/SECRET, or
 *    the iOS Limited Login `idToken` (OIDC JWT) against Facebook's JWKS,
 *    audience FACEBOOK_APP_ID.
 */
@Injectable()
export class SocialTokenVerifier {
  private readonly logger = new Logger(SocialTokenVerifier.name);
  private readonly jwt = new JwtService({});
  /** Exposed for tests (jest.spyOn on verifyIdToken). */
  readonly googleClient = new OAuth2Client();
  /** JWKS per URL (Apple, Facebook Limited Login), refetched on TTL or unknown kid. */
  private readonly jwksCache = new Map<
    string,
    { fetchedAt: number; keys: any[] }
  >();

  constructor(private readonly config: ConfigService) {}

  async verify(
    provider: string,
    tokens: SocialTokens,
  ): Promise<VerifiedSocialIdentity> {
    switch (provider) {
      case 'google':
        return this.verifyGoogle(tokens.idToken);
      case 'apple':
        return this.verifyApple(tokens.identityToken ?? tokens.idToken);
      case 'facebook':
        // Classic login gives an access token; iOS Limited Login only an OIDC JWT.
        if (!tokens.accessToken && tokens.idToken) {
          return this.verifyFacebookLimited(tokens.idToken);
        }
        return this.verifyFacebook(tokens.accessToken);
      default:
        throw new BadRequestException(
          `provider must be one of: ${SOCIAL_PROVIDERS.join(', ')}`,
        );
    }
  }

  private list(key: string): string[] {
    return (this.config.get<string>(key) ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  private notConfigured(provider: string): never {
    this.logger.error(`${provider} sign-in is not configured (missing env)`);
    throw new ServiceUnavailableException(
      `${provider} sign-in is not available right now`,
    );
  }

  async verifyGoogle(idToken?: string): Promise<VerifiedSocialIdentity> {
    if (!idToken) throw new BadRequestException('idToken is required');
    const audience = this.list('GOOGLE_CLIENT_IDS');
    if (!audience.length) this.notConfigured('Google');

    let payload: any;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(`Google token rejected: ${error?.message}`);
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!payload?.sub) throw new UnauthorizedException('Invalid Google token');

    return {
      provider: 'google',
      subject: String(payload.sub),
      email: payload.email ? String(payload.email).toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
    };
  }

  async verifyApple(identityToken?: string): Promise<VerifiedSocialIdentity> {
    if (!identityToken) {
      throw new BadRequestException('identityToken is required');
    }
    const audience = this.list('APPLE_BUNDLE_ID');
    if (!audience.length) this.notConfigured('Apple');

    const payload = await this.verifyJwksToken(identityToken, {
      provider: 'Apple',
      jwksUrl: APPLE_KEYS_URL,
      issuer: APPLE_ISSUER,
      audience,
    });

    return {
      provider: 'apple',
      subject: String(payload.sub),
      email: payload.email ? String(payload.email).toLowerCase() : null,
      // Apple sends a boolean or the string "true".
      emailVerified:
        payload.email_verified === true || payload.email_verified === 'true',
      name: null, // Apple only gives the name to the app, on first sign-in.
    };
  }

  async verifyFacebook(accessToken?: string): Promise<VerifiedSocialIdentity> {
    if (!accessToken) throw new BadRequestException('accessToken is required');
    const appId = this.config.get<string>('FACEBOOK_APP_ID')?.trim();
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET')?.trim();
    if (!appId || !appSecret) this.notConfigured('Facebook');

    const debugUrl =
      `${FACEBOOK_GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}` +
      `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const debug: any = await this.getJson(debugUrl, 'Facebook');
    const data = debug?.data;
    if (!data?.is_valid || String(data.app_id) !== appId || !data.user_id) {
      throw new UnauthorizedException('Invalid Facebook token');
    }

    const me: any = await this.getJson(
      `${FACEBOOK_GRAPH}/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`,
      'Facebook',
    );
    if (me?.id && String(me.id) !== String(data.user_id)) {
      throw new UnauthorizedException('Invalid Facebook token');
    }

    return {
      provider: 'facebook',
      subject: String(data.user_id),
      email: me?.email ? String(me.email).toLowerCase() : null,
      // Graph only returns a confirmed primary email; there is no flag.
      emailVerified: !!me?.email,
      name: me?.name ?? null,
    };
  }

  async verifyFacebookLimited(
    idToken?: string,
  ): Promise<VerifiedSocialIdentity> {
    if (!idToken) throw new BadRequestException('idToken is required');
    const appId = this.config.get<string>('FACEBOOK_APP_ID')?.trim();
    if (!appId) this.notConfigured('Facebook');

    const payload = await this.verifyJwksToken(idToken, {
      provider: 'Facebook',
      jwksUrl: FACEBOOK_JWKS_URL,
      issuer: FACEBOOK_OIDC_ISSUER,
      audience: [appId],
    });

    return {
      provider: 'facebook',
      // Same app-scoped user id that debug_token returns as user_id.
      subject: String(payload.sub),
      email: payload.email ? String(payload.email).toLowerCase() : null,
      // Like the Graph path: Facebook only shares a confirmed email.
      emailVerified: !!payload.email,
      name: payload.name ?? null,
    };
  }

  /** Verifies an RS256 JWT against a cached JWKS; any failure is a 401. */
  private async verifyJwksToken(
    token: string,
    opts: {
      provider: string;
      jwksUrl: string;
      issuer: string;
      audience: string[];
    },
  ): Promise<any> {
    const invalid = () =>
      new UnauthorizedException(`Invalid ${opts.provider} token`);
    const header = this.decodeHeader(token);
    if (!header?.kid || header.alg !== 'RS256') throw invalid();

    const jwk = await this.jwksKey(opts.jwksUrl, header.kid, opts.provider);
    if (!jwk) throw invalid();

    let payload: any;
    try {
      const publicKey = createPublicKey({ key: jwk, format: 'jwk' })
        .export({ type: 'spki', format: 'pem' })
        .toString();
      payload = this.jwt.verify(token, {
        publicKey,
        algorithms: ['RS256'],
        issuer: opts.issuer,
        audience:
          opts.audience.length === 1
            ? opts.audience[0]
            : (opts.audience as any),
      });
    } catch (error) {
      this.logger.warn(`${opts.provider} token rejected: ${error?.message}`);
      throw invalid();
    }
    if (!payload?.sub) throw invalid();
    return payload;
  }

  private decodeHeader(token: string): any {
    try {
      const [h] = token.split('.');
      return JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  private async jwksKey(
    url: string,
    kid: string,
    provider: string,
  ): Promise<any | null> {
    const cached = this.jwksCache.get(url);
    const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
    let key = fresh ? cached.keys.find((k) => k.kid === kid) : undefined;
    if (!key) {
      // Unknown kid: the provider may have rotated keys, so refetch once.
      const body: any = await this.getJson(url, provider);
      const keys = Array.isArray(body?.keys) ? body.keys : [];
      this.jwksCache.set(url, { fetchedAt: Date.now(), keys });
      key = keys.find((k) => k.kid === kid);
    }
    return key ?? null;
  }

  private async getJson(url: string, provider: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch (error) {
      this.logger.error(`${provider} request failed: ${error?.message}`);
      throw new ServiceUnavailableException(
        `${provider} sign-in is not available right now`,
      );
    }
    const body = await res.json().catch(() => null);
    if (!res.ok && res.status >= 500) {
      throw new ServiceUnavailableException(
        `${provider} sign-in is not available right now`,
      );
    }
    if (!res.ok) {
      // 4xx from Facebook debug_token/me means the token is bad.
      throw new UnauthorizedException(`Invalid ${provider} token`);
    }
    return body;
  }
}
