import { Global, Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';

/**
 * Global so any controller can use @UseGuards(JwtAuthGuard) or
 * @UseGuards(OptionalJwtAuthGuard) without importing anything.
 */
@Global()
@Module({
  providers: [TokenService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [TokenService, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthCommonModule {}
