import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'User full name (alternative field name)',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiProperty({
    description: 'Username',
    example: 'john_doe_123',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_name?: string;

  @ApiProperty({
    description: 'Email (read-only, included for frontend compatibility)',
    example: 'john@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'New password',
    example: 'newpassword123',
    required: false,
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({
    description: 'Password confirmation',
    example: 'newpassword123',
    required: false,
  })
  @IsOptional()
  @IsString()
  password_confirmation?: string;

  @ApiProperty({
    description: 'User bio',
    example: 'Food enthusiast and restaurant explorer',
    required: false,
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({
    description: 'User location',
    example: 'New York, NY',
    required: false,
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({
    description: 'Profile picture URL or filename',
    example: 'profile.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  profile_picture?: string;

  @ApiProperty({
    description: 'Image filename (for file uploads)',
    example: 'profile.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  image?: string;
}
