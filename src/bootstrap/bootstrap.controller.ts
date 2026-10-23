import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BaseUrl } from '../common/utils/public-url';
import { ok } from '../common/http/api-envelope';
import { BootstrapService } from './bootstrap.service';

@ApiTags('Bootstrap')
@Controller('api')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Get('bootstrap')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Startup data for a logged-in user',
    description:
      'data: { user, settings, categories, favoritePlaceIds, likedPlaceIds, ads, ' +
      'adRules, unreadNotifications }. Replaces the 7 calls in SplashScreen.js.',
  })
  @ApiResponse({ status: 200, description: 'Startup data' })
  @ApiResponse({ status: 401, description: 'Login required' })
  async bootstrap(
    @CurrentUser('id') userId: number,
    @BaseUrl() baseUrl: string,
  ) {
    return ok(await this.bootstrapService.forUser(userId, baseUrl));
  }

  @Get('bootstrap/guest')
  @ApiOperation({
    summary: 'Startup data for guests (no auth)',
    description: 'data: { categories, ads, adRules }',
  })
  @ApiResponse({ status: 200, description: 'Startup data' })
  async guest(@BaseUrl() baseUrl: string) {
    return ok(await this.bootstrapService.forGuest(baseUrl));
  }
}
