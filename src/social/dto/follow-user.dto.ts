import { IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FollowUserDto {
  @ApiProperty({
    description: 'User ID to follow',
    example: 123,
  })
  @IsInt()
  user_id: number;
}
