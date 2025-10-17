import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { Session } from '../entities/session.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, User]),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'crunchy-super-secret-jwt-key-change-in-production-2024',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
