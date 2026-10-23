import { IsInt, IsString, IsOptional, MaxLength } from 'class-validator';

export class CommentPostDto {
  @IsInt()
  post_id: number;

  @IsString()
  @MaxLength(500)
  comment: string;

  @IsOptional()
  @IsInt()
  created_id?: number;
}
