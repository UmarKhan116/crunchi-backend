import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SocialTokenVerifier } from './social/social-token-verifier.service';
import { User } from '../entities/user.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSetting]),
    NotificationsModule,
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'crunchy-super-secret-jwt-key-change-in-production-2024',
      signOptions: { expiresIn: '7d' },
    }),
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          // Save profile pictures in storage/user folder
          const uploadPath = './storage/user';
          
          // Create directory if it doesn't exist
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `profile-${uniqueSuffix}${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Only allow images for profile pictures
        const allowedTypes = /jpeg|jpg|png|gif/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname_test = allowedTypes.test(
          extname(file.originalname).toLowerCase(),
        );

        if (mimetype && extname_test) {
          return cb(null, true);
        }
        cb(
          new Error(
            'Invalid file type. Only images (JPEG, JPG, PNG, GIF) are allowed for profile pictures.',
          ),
          false,
        );
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB for profile pictures
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SocialTokenVerifier],
  exports: [AuthService],
})
export class AuthModule {}
