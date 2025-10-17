import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('api')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search/:query')
  @ApiOperation({ summary: 'Search users' })
  @ApiResponse({ status: 200, description: 'Users found successfully' })
  async searchUsers(@Param('query') query: string) {
    return this.searchService.searchUsers(query);
  }
}
