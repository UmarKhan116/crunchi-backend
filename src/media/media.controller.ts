import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MediaService } from './media.service';

@ApiTags('Media')
@Controller('api')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('imageupload')
  @ApiOperation({ summary: 'Upload image' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    return this.mediaService.uploadImage(file);
  }

  @Post('removeImage')
  @ApiOperation({ summary: 'Remove uploaded image' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Image removed successfully' })
  async removeImage(@Body() body: { filename: string }) {
    return this.mediaService.removeImage(body.filename);
  }

  @Get('get_media/:restaurant_id')
  @ApiOperation({ summary: 'Get media for restaurant' })
  @ApiResponse({
    status: 200,
    description: 'Restaurant media retrieved successfully',
  })
  async getRestaurantMedia(@Param('restaurant_id') restaurantId: string) {
    return this.mediaService.getRestaurantMedia(restaurantId);
  }
}
