import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
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
import { RemoveImageDto } from './dto/remove-image.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Media')
@Controller('api')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('imageupload')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload image' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    return this.mediaService.uploadImage(file);
  }

  @Post('removeImage')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove an image you uploaded' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Image removed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file path' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'Not your file' })
  async removeImage(
    @Body() body: RemoveImageDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.mediaService.removeImage(userId, body.filename ?? body.image);
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
