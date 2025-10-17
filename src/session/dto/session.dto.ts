import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty({
    description: 'Device type',
    example: 'mobile',
    required: false,
  })
  @IsOptional()
  @IsString()
  device_type?: string;

  @ApiProperty({
    description: 'Device token',
    example: 'device-token-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  device_token?: string;

  @ApiProperty({
    description: 'IP address',
    example: '192.168.1.1',
    required: false,
  })
  @IsOptional()
  @IsString()
  ip_address?: string;

  @ApiProperty({
    description: 'User agent',
    example: 'Mozilla/5.0...',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_agent?: string;
}
