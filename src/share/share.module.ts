import { Module } from '@nestjs/common';
import { EngagementModule } from '../engagement/engagement.module';
import { PlacesModule } from '../places/places.module';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

/** /p, /r, /u share pages and the /.well-known app-link files (WS5). */
@Module({
  imports: [EngagementModule, PlacesModule],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
