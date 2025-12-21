import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ValidationPipe,
  UseGuards,
  Request,
  Headers,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { UserProfileDto } from './dto/user-profile.dto';

@ApiTags('Authentication')
@Controller('api')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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

  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body(ValidationPipe) loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('socialLogin')
  @ApiOperation({ summary: 'Social login' })
  @ApiResponse({ status: 200, description: 'Social login successful' })
  async socialLogin(@Body(ValidationPipe) socialLoginDto: SocialLoginDto) {
    return this.authService.socialLogin(socialLoginDto);
  }

  @Post('forgot')
  @ApiOperation({ summary: 'Password reset request' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  async forgotPassword(
    @Body(ValidationPipe) forgotPasswordDto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  async getProfile(@Headers('authorization') authorization: string) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.authService.getProfile(userId);
  }

  @Post('update_profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @UseInterceptors(FileInterceptor('image'))
  async updateProfile(
    @Headers('authorization') authorization: string,
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
    const userId = this.extractUserIdFromToken(authorization);
    return this.authService.updateProfile(userId, userProfileDto, file);
  }

  @Get('user_status/:userId')
  @ApiOperation({ summary: 'Get user account status' })
  @ApiResponse({ status: 200, description: 'User status retrieved' })
  async getUserStatus(@Param('userId') userId: string) {
    return this.authService.getUserStatus(parseInt(userId));
  }
}
