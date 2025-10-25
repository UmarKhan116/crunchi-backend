import { IsInt, IsOptional } from 'class-validator';

export class LikePostDto {
  @IsInt()
  post_id: number;

  @IsOptional()
  @IsInt()
  user_id?: number;

  @IsOptional()
  @IsInt()
  created_id?: number;
}
