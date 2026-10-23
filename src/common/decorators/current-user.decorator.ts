import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.interface';

/**
 * The user set by JwtAuthGuard / OptionalJwtAuthGuard.
 * `@CurrentUser() user: AuthUser` or `@CurrentUser('id') userId: number`.
 * Undefined for guests on optional-auth routes.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);
