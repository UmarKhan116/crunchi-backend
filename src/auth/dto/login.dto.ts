import { IsEmail, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
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
