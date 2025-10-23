import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: { email: registerDto.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(registerDto.password, 10);

      // Get the full name from either full_name, fullName, or name field
      const fullName =
        registerDto.full_name ||
        registerDto.fullName ||
        registerDto.name ||
        registerDto.email.split('@')[0];

      // Get FCM token from either fcm_token or device_token
      const deviceToken =
        registerDto.fcm_token || registerDto.device_token || null;

      // Create new user
      const newUser = this.userRepository.create({
        email: registerDto.email,
        password: hashedPassword,
        full_name: fullName,
        user_name: registerDto.user_name || registerDto.userName || null,
        is_active: true,
        is_verified: false,
        device_token: deviceToken,
      });

      const savedUser = await this.userRepository.save(newUser);

      // Generate JWT token
      const token = this.jwtService.sign({
        id: savedUser.id,
        email: savedUser.email,
      });

      // Remove password from response
      delete savedUser.password;

      return {
        success: true,
        message: 'User registered successfully',
        token,
        user: savedUser,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      return {
        success: false,
        message: 'Registration failed: ' + error.message,
      };
    }
  }

  async login(loginDto: LoginDto) {
    try {
      // Find user by email
      const user = await this.userRepository.findOne({
        where: { email: loginDto.email },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // Check if user is active
      if (!user.is_active) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.password,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // Generate JWT token
      const token = this.jwtService.sign({
        id: user.id,
        email: user.email,
      });

      // Remove password from response
      delete user.password;

      return {
        success: true,
        message: 'Login successful',
        token,
        user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      return {
        success: false,
        message: 'Login failed: ' + error.message,
      };
    }
  }

  async socialLogin(socialLoginDto: SocialLoginDto) {
    try {
      let isNewUser = false;

      let user = await this.userRepository.findOne({
        where: {
          social_id: socialLoginDto.social_id,
          social_provider: socialLoginDto.provider,
        },
      });

      // If user doesn't exist, create new one
      if (!user) {
        // Check if email already exists
        if (socialLoginDto.email) {
          const existingUser = await this.userRepository.findOne({
            where: { email: socialLoginDto.email },
          });

          if (existingUser) {
            // Update existing user with social info
            existingUser.social_id = socialLoginDto.social_id;
            existingUser.social_provider = socialLoginDto.provider;
            user = await this.userRepository.save(existingUser);
          }
        }

        // Create new user if still not found
        if (!user) {
          isNewUser = true;
          user = this.userRepository.create({
            email: socialLoginDto.email,
            full_name:
              socialLoginDto.name || socialLoginDto.email?.split('@')[0],
            social_id: socialLoginDto.social_id,
            social_provider: socialLoginDto.provider,
            profile_picture: '',
            is_active: true,
            is_verified: true, // Social logins are considered verified
            password: await bcrypt.hash(Math.random().toString(36), 10), // Random password for social logins
          });

          user = await this.userRepository.save(user);
        }
      }

      // Generate JWT token
      const token = this.jwtService.sign({
        id: user.id,
        email: user.email,
      });

      // Remove password from response
      delete user.password;

      return {
        success: true,
        message: 'Social login successful',
        token,
        user,
        isNewUser,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Social login failed: ' + error.message,
      };
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    try {
      const user = await this.userRepository.findOne({
        where: { email: forgotPasswordDto.email },
      });

      if (!user) {
        // Don't reveal that user doesn't exist
        return {
          success: true,
          message:
            'If an account exists with this email, a password reset link has been sent',
        };
      }

      // Generate reset token
      const resetToken =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);

      // Set token and expiry (1 hour from now)
      user.reset_password_token = resetToken;
      user.reset_password_expires = new Date(Date.now() + 3600000); // 1 hour

      await this.userRepository.save(user);

      // TODO: Send email with reset link
      // await this.emailService.sendPasswordResetEmail(user.email, resetToken);

      return {
        success: true,
        message: 'Password reset link has been sent to your email',
        resetToken, // Remove this in production!
      };
    } catch (error) {
      return {
        success: false,
        message: 'Password reset failed: ' + error.message,
      };
    }
  }

  async getProfile(userId: number) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['posts', 'followers', 'following'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Remove password from response
      delete user.password;
      delete user.reset_password_token;
      delete user.reset_password_expires;

      return {
        success: true,
        user,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get profile: ' + error.message,
      };
    }
  }

  async updateProfile(userId: number, userProfileDto: UserProfileDto) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['posts', 'followers', 'following'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Update user fields
      if (userProfileDto.name) user.full_name = userProfileDto.name;
      if (userProfileDto.full_name) user.full_name = userProfileDto.full_name;
      if (userProfileDto.user_name) user.user_name = userProfileDto.user_name;
      if (userProfileDto.bio) user.bio = userProfileDto.bio;
      if (userProfileDto.location) user.location = userProfileDto.location;

      // Handle image/profile_picture
      if (userProfileDto.image) user.profile_picture = userProfileDto.image;
      if (userProfileDto.profile_picture)
        user.profile_picture = userProfileDto.profile_picture;

      // Handle password update
      if (userProfileDto.password && userProfileDto.password_confirmation) {
        // Validate passwords match
        if (userProfileDto.password !== userProfileDto.password_confirmation) {
          return {
            success: false,
            message: 'Passwords do not match',
          };
        }

        // Validate password length
        if (userProfileDto.password.length < 7) {
          return {
            success: false,
            message: 'Password must be at least 7 characters long',
          };
        }

        // Only update if password is not the placeholder
        if (userProfileDto.password !== '*************') {
          user.password = await bcrypt.hash(userProfileDto.password, 10);
        }
      }

      // Email is intentionally NOT updated for security reasons

      const updatedUser = await this.userRepository.save(user);

      // Remove sensitive fields from response
      delete updatedUser.password;
      delete updatedUser.reset_password_token;
      delete updatedUser.reset_password_expires;

      return {
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Profile update failed: ' + error.message,
      };
    }
  }

  async getUserStatus(userId: number) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'email', 'is_active', 'is_verified'],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return {
        success: true,
        isActive: user.is_active,
        isVerified: user.is_verified,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get user status: ' + error.message,
      };
    }
  }
}
