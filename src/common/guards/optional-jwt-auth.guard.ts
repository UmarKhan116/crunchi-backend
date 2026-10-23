import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../auth/token.service';

/**
 * `auth: optional`. Always lets the request through. Sets `request.user` when
 * a valid Bearer token is present; a missing or invalid token means "guest".
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.tokens.extractBearer(request.headers?.authorization);
    request.user = (token && this.tokens.verify(token)) || undefined;
    return true;
  }
}
