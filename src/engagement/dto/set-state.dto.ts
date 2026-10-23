import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetLikedDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  liked: boolean;
}

export class SetFavoriteDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  favorite: boolean;
}
