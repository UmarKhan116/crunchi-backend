import { IsEmail, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'Full name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({
    description: 'Full name (snake_case for mobile app)',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiProperty({
    description: 'Name (alternative to fullName)',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Username',
    example: 'johndoe123',
    required: false,
  })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiProperty({
    description: 'Username (snake_case for mobile app)',
    example: 'johndoe123',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_name?: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'Password confirmation',
    example: 'password123',
    required: false,
  })
  @IsOptional()
  @IsString()
  password_confirmation?: string;

  @ApiProperty({
    description: 'FCM token for push notifications',
    example: 'fcm-token-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  fcm_token?: string;

  @ApiProperty({
    description: 'Device token for push notifications',
    example: 'device-token-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  device_token?: string;
}
