import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('api')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('category-list')
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({
    status: 200,
    description: 'List of categories retrieved successfully',
  })
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Post('category/:id/icon')
  @ApiOperation({ summary: 'Upload and set category icon' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 201,
    description: 'Category icon uploaded and updated successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['image'],
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async uploadCategoryIcon(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    return this.categoriesService.updateIcon(id, file.filename);
  }
}
