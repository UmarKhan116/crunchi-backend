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
    description: 'Username',
    example: 'john_doe_123',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_name?: string;

  // Note: Email is not included in update DTO for security reasons
  // Email can only be set during registration and cannot be changed

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
    description: 'Profile picture URL',
    example: 'https://example.com/profile.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  profile_picture?: string;
}
