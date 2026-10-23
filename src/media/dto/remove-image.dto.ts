import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RemoveImageDto {
  @ApiPropertyOptional({
    description: 'Uploaded file name returned by imageupload (`url`)',
    example: 'image-u12-1700000000000-123456789.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  filename?: string;

  @ApiPropertyOptional({
    description: 'Same as `filename`; the current app sends this key',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image?: string;
}
