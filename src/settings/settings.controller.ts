import {
  Controller,
  Post,
  Get,
  Body,
  ValidationPipe,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { SettingsService } from './settings.service';
import { UserSettingsDto } from './dto/user-settings.dto';
import { AppSettingsDto } from './dto/app-settings.dto';

@ApiTags('Settings')
@Controller('api')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly jwtService: JwtService,
  ) {}

  private extractUserIdFromToken(authorization: string): number {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      const token = authorization.split(' ')[1];
      const decoded = this.jwtService.verify(token);

      if (!decoded.id) {
        throw new UnauthorizedException('Invalid token payload');
      }

      return decoded.id;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @Post('user-setting')
  @ApiOperation({ summary: 'Save user preferences' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'User settings saved successfully' })
  async saveUserSettings(
    @Body(ValidationPipe) userSettingsDto: UserSettingsDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.settingsService.saveUserSettings(userSettingsDto, userId);
  }

  @Get('get-app-settings')
  @ApiOperation({ summary: 'Get app settings' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'App settings retrieved successfully',
  })
  async getAppSettings(@Headers('authorization') authorization: string) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.settingsService.getAppSettings(userId);
  }

  @Post('app-setting')
  @ApiOperation({ summary: 'Save app settings' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'App settings saved successfully' })
  async saveAppSettings(
    @Body() appSettingsDto: any,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.settingsService.saveAppSettings(appSettingsDto, userId);
  }
}
