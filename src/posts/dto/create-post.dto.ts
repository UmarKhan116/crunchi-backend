import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Legacy builds rate in quarter stars (e.g. 3.75). The contract stores a
 * whole 1–5 rating, so in-range fractions are rounded instead of rejected.
 */
const roundRating = ({ value }: { value: unknown }) =>
  typeof value === 'number' && value > 0 && value <= 5
    ? Math.max(1, Math.round(value))
    : value;

/** POST /api/post-save (contract: Milestone 2 "Posts"). */
export class CreatePostDto {
  @IsString()
  @MaxLength(1000)
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  images: string[];

  @IsOptional()
  @IsString()
  location?: string;

  /** Optional: the first category is used when absent. */
  @IsOptional()
  @IsInt()
  category_id?: number;

  @Transform(roundRating)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsOptional()
  @IsString()
  restaurant?: string;

  /** Google place id. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  restaurant_id: string;
}
