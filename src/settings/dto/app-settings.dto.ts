import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AppSettingsDto {
  @ApiProperty({
    description: 'Setting key',
    example: 'app_version',
  })
  @IsString()
  key: string;

  @ApiProperty({
    description: 'Setting value',
    example: '1.0.0',
  })
  @IsString()
  value: string;

  @ApiProperty({
    description: 'Setting description',
    example: 'Current app version',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
