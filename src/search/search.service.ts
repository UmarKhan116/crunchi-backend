import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async searchUsers(query: string) {
    try {
      this.logger.log(`Received search request with query: "${query}"`);
      if (!query || query.trim().length === 0) {
        this.logger.warn('Empty search query received, returning no results');
        return {
          success: true,
          message: 'No search query provided',
          users: [],
        };
      }

      // Name or username only (never email). The OR group is bracketed so
      // the is_active filter applies to every match.
      const pattern = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`;
      const users = await this.userRepository
        .createQueryBuilder('user')
        .where('user.is_active = :isActive', { isActive: true })
        .andWhere(
          new Brackets((qb) => {
            qb.where('LOWER(user.full_name) LIKE LOWER(:pattern)', {
              pattern,
            }).orWhere('LOWER(user.user_name) LIKE LOWER(:pattern)', {
              pattern,
            });
          }),
        )
        .select([
          'user.id',
          'user.full_name',
          'user.user_name',
          'user.profile_picture',
          'user.bio',
        ])
        .orderBy('user.id', 'ASC')
        .take(50)
        .getMany();

      this.logger.log(`Found ${users.length} user(s) for query "${query}"`);

      return {
        success: true,
        message: 'Users found successfully',
        users,
      };
    } catch (error) {
      this.logger.error(
        `Failed to search users for query "${query}": ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: 'Failed to search users: ' + error.message,
        users: [],
      };
    }
  }
}
