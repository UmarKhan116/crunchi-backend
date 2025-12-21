import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { Admin } from '../entities/admin.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdvertisementsModule } from '../advertisements/advertisements.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    JwtModule.register({
      secret: process.env.ADMIN_JWT_SECRET || 'crunchy-admin-secret-2024',
      signOptions: { expiresIn: '1d' },
    }),
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          // Determine destination based on field name
          let uploadPath: string;
          if (file.fieldname === 'image') {
            uploadPath = './storage/category';
          } else if (file.fieldname === 'file') {
            uploadPath = './storage/video';
          } else {
            uploadPath = './storage';
          }

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
          let filename: string;
          if (file.fieldname === 'image') {
            filename = `category-${uniqueSuffix}${ext}`;
          } else if (file.fieldname === 'file') {
            filename = `ad-${uniqueSuffix}${ext}`;
          } else {
            filename = `file-${uniqueSuffix}${ext}`;
          }
          cb(null, filename);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
    AdvertisementsModule,
    CategoriesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
