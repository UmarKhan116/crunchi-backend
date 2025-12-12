import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from '../entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category]),
    // Multer configuration for category icon uploads
    MulterModule.register({
      storage: diskStorage({
        destination: './storage/category',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `category-${uniqueSuffix}${ext}`;
          cb(null, filename);
        },
      }),
    }),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
