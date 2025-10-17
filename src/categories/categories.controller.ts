import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
}
