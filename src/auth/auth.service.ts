import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
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
import { UserSetting } from '../entities/user-setting.entity';
import { toSafeUser } from '../common/utils/user-sanitizer';
import {
  SocialTokenVerifier,
  VerifiedSocialIdentity,
} from './social/social-token-verifier.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    private readonly jwtService: JwtService,
    private readonly socialVerifier: SocialTokenVerifier,
    private readonly config: ConfigService,
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

      // Get FCM token from login DTO if provided
      const deviceToken =
        (loginDto as any).fcm_token || (loginDto as any).device_token;

      // Update device token if provided
      if (deviceToken) {
        user.device_token = deviceToken;
        await this.userRepository.save(user);
        console.log(`✅ Updated device token for user ${user.id}`);
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

  /**
   * Verified when the body carries a provider token. The old unverified body
   * (`social_id` only) is accepted while ALLOW_LEGACY_SOCIAL_LOGIN=true (the
   * default) and rejected with 400 once it is flipped.
   */
  async socialLogin(dto: SocialLoginDto) {
    const hasToken = !!(dto.idToken || dto.identityToken || dto.accessToken);
    if (hasToken) {
      const identity = await this.socialVerifier.verify(dto.provider, dto);
      return this.verifiedSocialLogin(identity, dto);
    }
    if (!this.legacySocialLoginAllowed()) {
      throw new BadRequestException(
        'A provider token (idToken, identityToken or accessToken) is required',
      );
    }
    if (!dto.social_id) {
      throw new BadRequestException('social_id is required');
    }
    return this.legacySocialLogin(dto);
  }

  private legacySocialLoginAllowed(): boolean {
    const flag = this.config.get<string>('ALLOW_LEGACY_SOCIAL_LOGIN') ?? 'true';
    return flag.trim().toLowerCase() === 'true';
  }

  /**
   * Match on the verified (provider, subject). Link to an existing email
   * account only when the provider says the email is verified.
   */
  private async verifiedSocialLogin(
    identity: VerifiedSocialIdentity,
    dto: SocialLoginDto,
  ) {
    const deviceToken = dto.deviceToken || dto.device_token || dto.fcm_token;
    let isNewUser = false;

    let user = await this.userRepository.findOne({
      where: {
        social_provider: identity.provider,
        social_id: identity.subject,
      },
    });

    if (!user && identity.email) {
      const existing = await this.userRepository
        .createQueryBuilder('user')
        .where('LOWER(user.email) = LOWER(:email)', { email: identity.email })
        .getOne();
      if (existing) {
        if (!identity.emailVerified) {
          throw new ConflictException(
            'An account with this email already exists. Log in with your password.',
          );
        }
        existing.social_id = identity.subject;
        existing.social_provider = identity.provider;
        user = existing;
      }
    }

    if (!user) {
      isNewUser = true;
      const fullName =
        dto.fullName?.trim() ||
        dto.name?.trim() ||
        identity.name ||
        identity.email?.split('@')[0] ||
        'Crunchii user';
      user = this.userRepository.create({
        // users.email is NOT NULL + UNIQUE; Apple/Facebook may hide the email.
        email:
          identity.email ??
          `${identity.provider}_${identity.subject}@social.crunchii.invalid`,
        full_name: fullName,
        social_id: identity.subject,
        social_provider: identity.provider,
        profile_picture: '',
        is_active: true,
        is_verified: identity.emailVerified,
        password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        device_token: deviceToken || null,
      });
    } else if (!user.is_active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (deviceToken) user.device_token = deviceToken;
    user = await this.userRepository.save(user);

    const token = this.jwtService.sign({ id: user.id, email: user.email });
    delete user.password;
    delete user.reset_password_token;
    delete user.reset_password_expires;

    return {
      success: true,
      message: 'Social login successful',
      token,
      user,
      isNewUser,
    };
  }

  /** Pre-Milestone-1 behaviour, unchanged: trusts the client's social_id. */
  private async legacySocialLogin(socialLoginDto: SocialLoginDto) {
    try {
      let isNewUser = false;
      const deviceToken =
        socialLoginDto.device_token || socialLoginDto.fcm_token;

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
            // Update device token if provided
            if (deviceToken) {
              existingUser.device_token = deviceToken;
            }
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
            device_token: deviceToken || null, // Save device token for new users
          });

          user = await this.userRepository.save(user);
        }
      } else {
        // Update device token for existing users
        if (deviceToken) {
          user.device_token = deviceToken;
          user = await this.userRepository.save(user);
          console.log(
            `✅ Updated device token for social login user ${user.id}`,
          );
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
        relations: [
          'posts',
          'posts.restaurant',
          'followers',
          'followers.follower',
          'following',
          'following.following',
        ],
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Fetch user settings/preferences from database
      const userSettings = await this.userSettingRepository.findOne({
        where: { user_id: userId },
      });

      // Remove password from response
      delete user.password;
      delete user.reset_password_token;
      delete user.reset_password_expires;

      // Transform posts to match frontend expectations
      if (user.posts && user.posts.length > 0) {
        user.posts = user.posts.map((post: any) => {
          // Transform images array to file array format
          const file = [];
          if (post.images && Array.isArray(post.images)) {
            post.images.forEach((imageUrl: string) => {
              // Detect if it's a video or image based on extension
              const extension = imageUrl.split('.').pop()?.toLowerCase();
              const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
              const type = videoExtensions.includes(extension || '')
                ? 'video'
                : 'image';

              file.push({
                filenames: imageUrl,
                type: type,
              });
            });
          }

          return {
            ...post,
            file: file,
            review: post.description, // Frontend expects 'review', backend has 'description'
            name: post.location, // Frontend expects 'name' field for post title
            restaurant: post.restaurant?.name || post.location, // Restaurant name
          };
        });
      }

      // Transform followers: follower → follows (to match frontend expectation)
      if (user.followers && user.followers.length > 0) {
        // Followers are other people: public fields only.
        user.followers = user.followers.map((follow: any) => ({
          ...follow,
          follower: toSafeUser(follow.follower),
          follows: toSafeUser(follow.follower) ?? null,
        }));
      } else {
        user.followers = [];
      }

      // Transform following: ensure following property exists with image
      if (user.following && user.following.length > 0) {
        user.following = user.following.map((follow: any) => ({
          ...follow,
          following: toSafeUser(follow.following) ?? null,
        }));
      } else {
        user.following = [];
      }

      // Add 'image' field for backwards compatibility (frontend expects 'image')
      const transformedUser = {
        ...user,
        image: user.profile_picture,
        user_settings: userSettings || null, // Include user preferences from database
      };

      return {
        success: true,
        user: transformedUser,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get profile: ' + error.message,
      };
    }
  }

  async updateProfile(
    userId: number,
    userProfileDto: UserProfileDto,
    file?: Express.Multer.File,
  ) {
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

      // Handle image upload - if file is provided, use it; otherwise use image string from body
      if (file) {
        // File is already saved in storage/user folder by multer
        // Save the filename to profile_picture
        user.profile_picture = file.filename;
      } else if (userProfileDto.image) {
        // If image is provided as string (filename), use it directly
        user.profile_picture = userProfileDto.image;
      } else if (userProfileDto.profile_picture) {
        user.profile_picture = userProfileDto.profile_picture;
      }

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

      // Add 'image' field for backwards compatibility (frontend expects 'image')
      // Same transformation as getProfile method
      const transformedUser = {
        ...updatedUser,
        image: updatedUser.profile_picture,
      };

      return {
        success: true,
        message: 'Profile updated successfully',
        user: transformedUser,
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
