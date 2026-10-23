import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { Post } from '../entities/post.entity';
import { Restaurant } from '../entities/restaurant.entity';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { uploadOwnerPrefix } from './media.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Restaurant]),
    MulterModule.register({
      storage: diskStorage({
        destination: './storage',
        filename: (req: any, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase();
          // JwtAuthGuard runs before this interceptor, so req.user is set.
          // The owner prefix lets removeImage check ownership.
          const prefix = req.user?.id
            ? uploadOwnerPrefix(req.user.id)
            : `${file.fieldname}-`;
          cb(null, `${prefix}${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|wmv|flv|webm/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname_test = allowedTypes.test(
          extname(file.originalname).toLowerCase(),
        );

        if (mimetype && extname_test) {
          return cb(null, true);
        }
        cb(
          new Error(
            'Invalid file type. Only images (JPEG, JPG, PNG, GIF) and videos (MP4, MOV, AVI, WMV, FLV, WEBM) are allowed.',
          ),
          false,
        );
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB for videos
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
