import {
  IsEmail,
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * New clients send a provider token (`idToken`, `identityToken` or
 * `accessToken`; Facebook sends `accessToken` or, with iOS Limited Login,
 * `idToken`) that the server verifies. Old builds send `social_id`
 * without a token; that path only works while ALLOW_LEGACY_SOCIAL_LOGIN=true.
 */
export class SocialLoginDto {
  @ApiProperty({ enum: ['google', 'apple', 'facebook'] })
  @IsString()
  provider: string;

  @ApiPropertyOptional({
    description:
      'Google ID token, or the Facebook Limited Login (iOS) OIDC token',
  })
  @IsOptional()
  @IsString()
  idToken?: string;

  @ApiPropertyOptional({ description: 'Apple identity token (JWT)' })
  @IsOptional()
  @IsString()
  identityToken?: string;

  @ApiPropertyOptional({
    description: 'Facebook user access token (classic login)',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'Name from the provider SDK (Apple only shares it once)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ description: 'FCM token' })
  @IsOptional()
  @IsString()
  deviceToken?: string;

  @ApiPropertyOptional({ enum: ['ios', 'android'] })
  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';

  // ---- Legacy body (unverified), kept for old app builds ----

  @ApiPropertyOptional({ description: 'Legacy: unverified provider user id' })
  @IsOptional()
  @IsString()
  social_id?: string;

  @ApiPropertyOptional({ description: 'Legacy' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Legacy' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Legacy' })
  @IsOptional()
  @IsString()
  fcm_token?: string;

  @ApiPropertyOptional({ description: 'Legacy' })
  @IsOptional()
  @IsString()
  device_token?: string;
}
