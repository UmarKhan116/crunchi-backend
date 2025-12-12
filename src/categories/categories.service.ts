import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async findAll() {
    try {
      const categories = await this.categoryRepository.find({
        order: { name: 'ASC' },
      });

      return {
        success: true,
        Category: categories,
        categories: categories,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch categories: ' + error.message,
        categories: [],
      };
    }
  }

  async create(name: string, icon?: string) {
    try {
      const category = this.categoryRepository.create({ name, icon });
      const savedCategory = await this.categoryRepository.save(category);

      return {
        success: true,
        message: 'Category created successfully',
        category: savedCategory,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create category: ' + error.message,
      };
    }
  }

  async updateIcon(categoryId: number, filename: string) {
    try {
      const category = await this.categoryRepository.findOne({
        where: { id: categoryId },
      });

      if (!category) {
        return {
          success: false,
          message: 'Category not found',
        };
      }

      category.icon = filename;
      const savedCategory = await this.categoryRepository.save(category);

      return {
        success: true,
        message: 'Category icon updated successfully',
        category: savedCategory,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update category icon: ' + error.message,
      };
    }
  }
}
