import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdvertisementDto {
  @ApiProperty({
    description: 'Advertisement title',
    example: 'Summer Sale',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Advertisement description',
    example: 'Get 50% off on all items',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
