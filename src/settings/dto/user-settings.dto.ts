import {
  IsBoolean,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserSettingsDto {
  @ApiProperty({
    description: 'Enable notifications',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  notifications_enabled?: boolean;

  @ApiProperty({
    description: 'Enable location sharing',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  location_sharing?: boolean;

  @ApiProperty({
    description: 'Profile visibility',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  profile_visibility?: boolean;

  @ApiProperty({
    description: 'Preferred language',
    example: 'en',
    required: false,
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({
    description: 'Distance unit',
    example: 'km',
    required: false,
  })
  @IsOptional()
  @IsString()
  distance_unit?: string;

  @ApiProperty({
    description: 'Search radius in km',
    example: 10.0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  search_radius?: number;

  @ApiProperty({
    description: 'Favorite category IDs',
    example: [1, 2, 3],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  favorite_categories?: number[];

  @ApiProperty({
    description: 'Dietary preferences',
    example: ['vegetarian', 'gluten-free'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietary_preferences?: string[];
}
