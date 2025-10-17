import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getUserNotifications(userId?: number) {
    try {
      const notifications = await this.notificationRepository.find({
        where: { user_id: userId },
        order: { created_at: 'DESC' },
        take: 100,
      });

      return {
        success: true,
        message: 'Notifications retrieved successfully',
        data: notifications,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get notifications: ' + error.message,
        data: [],
      };
    }
  }

  async createNotification(
    userId: number,
    type: string,
    message: string,
    data?: any,
  ) {
    try {
      const notification = this.notificationRepository.create({
        user_id: userId,
        type,
        message,
        data,
      });

      await this.notificationRepository.save(notification);

      return {
        success: true,
        message: 'Notification created successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create notification: ' + error.message,
      };
    }
  }
}
