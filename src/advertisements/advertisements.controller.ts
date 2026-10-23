import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdvertisementsService } from './advertisements.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Advertisements')
@Controller('api')
export class AdvertisementsController {
  constructor(private readonly advertisementsService: AdvertisementsService) {}

  @Get('get-advertisements')
  @ApiOperation({ summary: 'Fetch advertisements' })
  @ApiResponse({
    status: 200,
    description: 'Advertisements list retrieved successfully',
  })
  async getAdvertisements() {
    return this.advertisementsService.getAdvertisements();
  }

  @Post('advertisement-view')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Track advertisement view' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Advertisement view tracked successfully',
  })
  @ApiResponse({ status: 401, description: 'Login required' })
  async trackAdvertisementView(
    @Body() viewData: any,
    @CurrentUser('id') userId: number,
  ) {
    return this.advertisementsService.trackAdvertisementView(viewData, userId);
  }
}
