import { IsInt, IsString } from 'class-validator';

export class CommentPostDto {
  @IsInt()
  post_id: number;

  @IsString()
  comment: string;
}
