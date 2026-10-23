import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  Matches,
} from 'class-validator';

/** Body `{ ids: string[] }` or `{ all: true }`. */
export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], example: ['12', '13'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^\d{1,10}$/, { each: true, message: 'ids must be numeric strings' })
  ids?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
