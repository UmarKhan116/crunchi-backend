import { IsInt } from 'class-validator';

export class LikePostDto {
  @IsInt()
  post_id: number;
}
