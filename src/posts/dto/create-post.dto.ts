import { IsString, IsArray, IsOptional, IsInt } from 'class-validator';

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
}
