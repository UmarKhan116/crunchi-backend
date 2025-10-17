import { IsInt } from 'class-validator';

export class FavoriteRestaurantDto {
  @IsInt()
  restaurant_id: number;
}
