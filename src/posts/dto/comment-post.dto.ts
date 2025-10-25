import { IsInt, IsString, IsOptional } from 'class-validator';

export class CommentPostDto {
  @IsInt()
  post_id: number;

  @IsString()
  comment: string;

  @IsOptional()
  @IsInt()
  created_id?: number;
}
