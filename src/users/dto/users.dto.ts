import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CursorQueryDto } from '../../common/dto/cursor-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UserSearchQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Matches userName or fullName' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class SetFollowingDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  following: boolean;
}

/** PATCH /api/me. Send only the fields to change. */
export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  fullName?: string;

  @ApiPropertyOptional({
    description: '3–30 letters, digits, dots or underscores; unique',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9._]{3,30}$/, {
    message: 'userName must be 3–30 letters, digits, dots or underscores',
  })
  userName?: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'URL (or /storage/ path) of an image uploaded with /api/imageupload; null removes the avatar',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1024)
  avatarUrl?: string | null;
}
