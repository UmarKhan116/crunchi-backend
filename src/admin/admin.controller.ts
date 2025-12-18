import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  Headers,
  Get,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdvertisementsService } from '../advertisements/advertisements.service';
import { CreateAdvertisementDto } from '../advertisements/dto/create-advertisement.dto';
import { CategoriesService } from '../categories/categories.service';
import { extname } from 'path';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly jwtService: JwtService,
    private readonly advertisementsService: AdvertisementsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  private extractAdminIdFromToken(authorization: string): number {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      const token = authorization.split(' ')[1];
      // Use JwtService without explicit secret - it uses the secret from module registration
      const decoded: any = this.jwtService.verify(token);

      if (!decoded.id || decoded.role !== 'admin') {
        throw new UnauthorizedException('Invalid admin token');
      }

      return decoded.id;
    } catch (error) {
      // Re-throw if it's already our custom UnauthorizedException
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // For JWT verification errors (expired, invalid signature, etc.)
      throw new UnauthorizedException('Invalid or expired admin token');
    }
  }

  @Post('login')
  @ApiOperation({ summary: 'Admin login (separate from user login)' })
  @ApiBody({ type: AdminLoginDto })
  async login(@Body(ValidationPipe) loginDto: AdminLoginDto) {
    return this.adminService.login(loginDto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current admin profile (admin only)' })
  @ApiBearerAuth('JWT-auth')
  async me(@Headers('authorization') authorization: string) {
    const adminId = this.extractAdminIdFromToken(authorization);
    return this.adminService.getProfile(adminId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Example admin-only stats endpoint' })
  @ApiBearerAuth('JWT-auth')
  async getStats(@Headers('authorization') authorization: string) {
    const adminId = this.extractAdminIdFromToken(authorization);

    return {
      success: true,
      adminId,
      message: 'Only admin can see this data',
    };
  }

  @Post('advertisements')
  @ApiOperation({ summary: 'Upload a new advertisement (admin only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['file', 'title'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAdvertisement(
    @Headers('authorization') authorization: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateAdvertisementDto,
  ) {
    this.extractAdminIdFromToken(authorization);

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const fileExt = extname(file.originalname).replace('.', '').toLowerCase();

    // Validate file type (only images and videos allowed)
    const allowedImageTypes = ['jpg', 'jpeg', 'png'];
    const allowedVideoTypes = ['mp4'];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

    if (!allowedTypes.includes(fileExt)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }

    return this.advertisementsService.createAdvertisement({
      ...body,
      file_name: file.filename,
      type: fileExt,
    });
  }

  @Post('categories/:id/icon')
  @ApiOperation({ summary: 'Upload and set category icon (admin only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiConsumes('multipart/form-data')
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
    @Headers('authorization') authorization: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.extractAdminIdFromToken(authorization);

    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    return this.categoriesService.updateIcon(id, file.filename);
  }
}
