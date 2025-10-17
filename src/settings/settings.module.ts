import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UserSetting } from '../entities/user-setting.entity';
import { AppSetting } from '../entities/app-setting.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSetting, AppSetting, User]),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'crunchy-super-secret-jwt-key-change-in-production-2024',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
