import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** `?cursor=<opaque>&limit=<n>` from the contract's pagination convention. */
export class CursorQueryDto {
  @ApiPropertyOptional({ description: 'Opaque; from the previous nextCursor' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({ description: 'Default 20, max 50 (clamped)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

/** Contract defaults: 20, at most 50. Over-limit values are clamped. */
export function pageLimit(
  limit: number | undefined,
  def = DEFAULT_PAGE_LIMIT,
  max = MAX_PAGE_LIMIT,
): number {
  return Math.min(limit ?? def, max);
}
