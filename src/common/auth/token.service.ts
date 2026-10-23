import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from './auth-user.interface';
import { LEGACY_JWT_SECRET } from './jwt-secrets';

/**
 * Verifies the Bearer tokens issued by POST /api/login, /register and
 * /socialLogin. Used by JwtAuthGuard and OptionalJwtAuthGuard.
 */
@Injectable()
export class TokenService {
  private readonly jwt = new JwtService({});
  private readonly secrets: string[];

  constructor(config: ConfigService) {
    const configured = config.get<string>('JWT_SECRET');
    // Usually both are the same value. They differ only when JWT_SECRET lives
    // in .env alone; see jwt-secrets.ts for why the legacy one must be kept.
    this.secrets = [...new Set([configured, LEGACY_JWT_SECRET])].filter(
      (s): s is string => !!s,
    );
  }

  extractBearer(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !value.startsWith('Bearer ')) return null;
    const token = value.slice('Bearer '.length).trim();
    return token || null;
  }

  /** Returns the user for a valid token, or null. Never throws. */
  verify(token: string): AuthUser | null {
    for (const secret of this.secrets) {
      try {
        const payload: any = this.jwt.verify(token, {
          secret,
          algorithms: ['HS256'],
        });
        const id = Number(payload?.id);
        return Number.isInteger(id) && id > 0 ? { id } : null;
      } catch {
        // try the next secret
      }
    }
    return null;
  }
}
