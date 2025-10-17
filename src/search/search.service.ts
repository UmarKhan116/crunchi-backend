import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async searchUsers(query: string) {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: true,
          message: 'No search query provided',
          users: [],
        };
      }

      // Search users by name, username, or email (case-insensitive)
      const users = await this.userRepository
        .createQueryBuilder('user')
        .where('LOWER(user.full_name) LIKE LOWER(:query)', {
          query: `%${query}%`,
        })
        .orWhere('LOWER(user.user_name) LIKE LOWER(:query)', {
          query: `%${query}%`,
        })
        .orWhere('LOWER(user.email) LIKE LOWER(:query)', {
          query: `%${query}%`,
        })
        .andWhere('user.is_active = :isActive', { isActive: true })
        .select([
          'user.id',
          'user.email',
          'user.full_name',
          'user.user_name',
          'user.profile_picture',
          'user.bio',
        ])
        .take(50)
        .getMany();

      return {
        success: true,
        message: 'Users found successfully',
        users,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to search users: ' + error.message,
        users: [],
      };
    }
  }
}
