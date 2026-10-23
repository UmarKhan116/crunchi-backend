import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ValidationPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('api')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests (10/min per IP)',
  })
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests (10/min per IP)',
  })
  async login(@Body(ValidationPipe) loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('socialLogin')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Social login (verified)',
    description:
      'Send provider + idToken (Google), identityToken (Apple) or accessToken (Facebook). ' +
      'The old body with only social_id is accepted while ALLOW_LEGACY_SOCIAL_LOGIN=true.',
  })
  @ApiResponse({ status: 200, description: 'Social login successful' })
  @ApiResponse({
    status: 400,
    description: 'Missing token / legacy body disabled',
  })
  @ApiResponse({ status: 401, description: 'Token failed verification' })
  @ApiResponse({
    status: 409,
    description:
      'Email belongs to an account and is not verified by the provider',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests (10/min per IP)',
  })
  async socialLogin(@Body(ValidationPipe) socialLoginDto: SocialLoginDto) {
    return this.authService.socialLogin(socialLoginDto);
  }

  @Post('forgot')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Password reset request' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests (10/min per IP)',
  })
  async forgotPassword(
    @Body(ValidationPipe) forgotPasswordDto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  async getProfile(@CurrentUser('id') userId: number) {
    return this.authService.getProfile(userId);
  }

  @Post('update_profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @UseInterceptors(FileInterceptor('image'))
  async updateProfile(
    @CurrentUser('id') userId: number,
    @Body(
      new ValidationPipe({
        skipMissingProperties: true,
        whitelist: false,
        forbidNonWhitelisted: false,
      }),
    )
    userProfileDto: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.updateProfile(userId, userProfileDto, file);
  }

  @Get('user_status/:userId')
  @ApiOperation({ summary: 'Get user account status' })
  @ApiResponse({ status: 200, description: 'User status retrieved' })
  async getUserStatus(@Param('userId') userId: string) {
    return this.authService.getUserStatus(parseInt(userId));
  }
}
