import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { TokenService } from '../auth/token.service';
import { LEGACY_JWT_SECRET } from '../auth/jwt-secrets';

const CONFIGURED_SECRET = 'configured-secret-for-tests';

function contextFor(headers: Record<string, string>) {
  const request: any = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

function sign(
  payload: object,
  secret: string,
  expiresIn: string | null = '1h',
) {
  return new JwtService({}).sign(
    payload,
    expiresIn ? { secret, expiresIn } : { secret },
  );
}

describe('JWT guards', () => {
  const config = {
    get: (key: string) =>
      key === 'JWT_SECRET' ? CONFIGURED_SECRET : undefined,
  } as unknown as ConfigService;
  const tokens = new TokenService(config);

  describe('JwtAuthGuard (auth: required)', () => {
    const guard = new JwtAuthGuard(tokens);

    it('accepts a token signed with the configured secret and sets request.user', () => {
      const { request, context } = contextFor({
        authorization: `Bearer ${sign({ id: 7, email: 'a@b.c' }, CONFIGURED_SECRET)}`,
      });
      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({ id: 7 });
    });

    it('accepts a token signed by the legacy JwtModule secret', () => {
      const { request, context } = contextFor({
        authorization: `Bearer ${sign({ id: 3 }, LEGACY_JWT_SECRET)}`,
      });
      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({ id: 3 });
    });

    it('rejects a missing header with 401', () => {
      const { context } = contextFor({});
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects a non-Bearer header', () => {
      const { context } = contextFor({ authorization: 'Basic abc' });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects a token signed with another secret', () => {
      const { context } = contextFor({
        authorization: `Bearer ${sign({ id: 1 }, 'attacker-secret')}`,
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects an expired token', () => {
      const expired = sign(
        { id: 1, exp: Math.floor(Date.now() / 1000) - 60 },
        CONFIGURED_SECRET,
        null,
      );
      const { context } = contextFor({ authorization: `Bearer ${expired}` });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects a token without an id', () => {
      const { context } = contextFor({
        authorization: `Bearer ${sign({ email: 'x@y.z' }, CONFIGURED_SECRET)}`,
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects an unsigned (alg none) token', () => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const body = Buffer.from(JSON.stringify({ id: 1 })).toString('base64url');
      const { context } = contextFor({
        authorization: `Bearer ${header}.${body}.`,
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('OptionalJwtAuthGuard (auth: optional)', () => {
    const guard = new OptionalJwtAuthGuard(tokens);

    it('sets request.user for a valid token', () => {
      const { request, context } = contextFor({
        authorization: `Bearer ${sign({ id: 9 }, CONFIGURED_SECRET)}`,
      });
      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({ id: 9 });
    });

    it('lets guests through with no user', () => {
      const { request, context } = contextFor({});
      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('treats an invalid token as a guest instead of failing', () => {
      const { request, context } = contextFor({
        authorization: 'Bearer garbage',
      });
      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toBeUndefined();
    });
  });
});
