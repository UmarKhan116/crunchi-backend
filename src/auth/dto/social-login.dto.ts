import { IsEmail, IsString, IsOptional } from 'class-validator';

export class SocialLoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  provider: string;

  @IsString()
  social_id: string;

  @IsOptional()
  @IsString()
  fcm_token?: string;

  @IsOptional()
  @IsString()
  device_token?: string;
}
