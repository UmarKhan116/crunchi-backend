import { IsString, IsArray, IsOptional } from 'class-validator';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  location?: string;
}
