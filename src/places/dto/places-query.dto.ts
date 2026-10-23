import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

/** `openNow=true` → true; absent/anything else → false. */
const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

/** "1, 2,3" → [1, 2, 3]; invalid entries stay NaN and fail validation. */
const toIdList = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const ids = parts
    .map((p) => String(p).trim())
    .filter(Boolean)
    .map(Number);
  return ids.length ? ids : undefined;
};

export class FeedQueryDto {
  @ApiProperty({ example: 33.7222 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: -116.3745 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({
    description: 'Metres; default 8000, max 48000',
    example: 8000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  radiusM?: number;

  @ApiPropertyOptional({
    description:
      'Comma-separated category ids. Empty = the user’s selected categories (all for guests).',
    example: '1,4',
  })
  @IsOptional()
  @Transform(toIdList)
  @IsInt({ each: true })
  categories?: number[];

  @ApiPropertyOptional({ enum: ['true'] })
  @IsOptional()
  @Transform(toBool)
  openNow?: boolean;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({ description: 'Default 10, max 20', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class PlaceDetailsQueryDto {
  @ApiPropertyOptional({ description: 'Caller position, for distanceM' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class PlacePostsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({ description: 'Default 20, max 50' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class PhotoQueryDto {
  @ApiPropertyOptional({
    description: 'Requested width; clamped to 400, 800 or 1200 (default 800)',
    example: 800,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  w?: string;
}

export class PlaceSearchQueryDto {
  @ApiProperty({ example: 'tacos' })
  @IsString()
  @Length(1, 100)
  query: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ description: 'Metres (max 48000)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  radiusM?: number;

  @ApiPropertyOptional({ enum: ['true'] })
  @IsOptional()
  @Transform(toBool)
  openNow?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;
}

export class AutocompleteQueryDto {
  @ApiProperty({ example: 'pizz' })
  @IsString()
  @Length(1, 100)
  input: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ description: 'Google autocomplete session token' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sessionToken?: string;
}

export class ReverseGeocodeQueryDto {
  @ApiProperty({ example: 33.7222 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: -116.3745 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;
}
