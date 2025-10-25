import {
  IsString,
  IsArray,
  IsOptional,
  IsInt,
  IsNumber,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsInt()
  category_id: number;

  @IsOptional()
  @IsNumber()
  rating?: number;

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

  @IsOptional()
  @IsString()
  restaurant_id?: string;
}
