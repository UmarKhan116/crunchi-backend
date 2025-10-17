import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionDto } from './dto/session.dto';
import { Session } from '../entities/session.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async trackSession(sessionDto: SessionDto, userId?: number) {
    try {
      const actualUserId = userId || (sessionDto as any).user_id;
      const sessionId =
        (sessionDto as any).session_id ||
        `session_${Date.now()}_${Math.random()}`;

      // Find existing session or create new
      let session = await this.sessionRepository.findOne({
        where: { session_id: sessionId },
      });

      if (session) {
        // Update existing session
        session.last_activity = new Date();
        session.is_active = true;
        if ((sessionDto as any).device_token)
          session.device_token = (sessionDto as any).device_token;
        if ((sessionDto as any).device_type)
          session.device_type = (sessionDto as any).device_type;
        if ((sessionDto as any).ip_address)
          session.ip_address = (sessionDto as any).ip_address;
        if ((sessionDto as any).user_agent)
          session.user_agent = (sessionDto as any).user_agent;
      } else {
        // Create new session
        session = this.sessionRepository.create({
          user_id: actualUserId,
          session_id: sessionId,
          device_type: (sessionDto as any).device_type,
          device_token: (sessionDto as any).device_token,
          ip_address: (sessionDto as any).ip_address,
          user_agent: (sessionDto as any).user_agent,
          is_active: true,
          last_activity: new Date(),
        });
      }

      const savedSession = await this.sessionRepository.save(session);

      return {
        success: true,
        message: 'Session tracked successfully',
        data: {
          session_id: savedSession.session_id,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to track session: ' + error.message,
      };
    }
  }
}
