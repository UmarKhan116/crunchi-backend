import { IsInt, IsOptional, IsString, IsNumber } from 'class-validator';

export class FavoriteRestaurantDto {
  @IsOptional()
  @IsInt()
  restaurant_id?: number;

  @IsOptional()
  @IsString()
  google_place_id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  restaurant_name?: string;

  @IsOptional()
  @IsString()
  photo_reference?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  rating?: number;
}
