import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { SessionService } from './session.service';
import { SessionDto } from './dto/session.dto';

@ApiTags('Session')
@Controller('api')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
  ) {}

  private extractUserIdFromToken(authorization: string): number {
    try {
      if (!authorization || !authorization.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }

      const token = authorization.split(' ')[1];
      const decoded = this.jwtService.verify(token);

      if (!decoded.id) {
        throw new UnauthorizedException('Invalid token payload');
      }

      return decoded.id;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @Post('session')
  @ApiOperation({ summary: 'Track user session' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Session tracked successfully' })
  async trackSession(
    @Body(ValidationPipe) sessionDto: SessionDto,
    @Headers('authorization') authorization: string,
  ) {
    const userId = this.extractUserIdFromToken(authorization);
    return this.sessionService.trackSession(sessionDto, userId);
  }
}
