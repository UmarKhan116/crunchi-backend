import { Controller, Get, Post, Body, ValidationPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdvertisementsService } from './advertisements.service';

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
  @ApiOperation({ summary: 'Track advertisement view' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Advertisement view tracked successfully',
  })
  async trackAdvertisementView(@Body() viewData: any) {
    return this.advertisementsService.trackAdvertisementView(viewData);
  }
}
