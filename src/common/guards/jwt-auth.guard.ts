import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '../auth/token.service';

/**
 * `auth: required`. Rejects the request with 401 unless it carries a valid
 * `Authorization: Bearer <jwt>`, and sets `request.user = { id }`.
 * Read the user with the @CurrentUser() decorator.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.tokens.extractBearer(request.headers?.authorization);
    const user = token ? this.tokens.verify(token) : null;
    if (!user) {
      // Same message the old per-controller extractUserIdFromToken() used.
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.user = user;
    return true;
  }
}
