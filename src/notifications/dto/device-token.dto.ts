import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'FCM registration token' })
  @IsString()
  @Length(1, 4096)
  @Matches(/^\S+$/, { message: 'token must not contain spaces' })
  token: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';

  @ApiPropertyOptional({ example: '2.0.0' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  appVersion?: string;
}
