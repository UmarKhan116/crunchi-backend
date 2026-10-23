import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { BaseUrl } from '../common/utils/public-url';
import {
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  readShareConfig,
} from './share-config';
import { ShareResult, ShareService } from './share.service';

/**
 * Share links and app-link files, outside the /api prefix (WS5). Pages are
 * cached 5 minutes because posts can be hidden later.
 */
@ApiExcludeController()
@Controller()
export class ShareController {
  constructor(private readonly share: ShareService) {}

  private send(res: Response, page: ShareResult) {
    res
      .status(page.status)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        // Defence in depth on top of escaping: no scripts at all.
        'Content-Security-Policy':
          "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      })
      .send(page.html);
  }

  @Get('p/:postId')
  async post(
    @Param('postId') postId: string,
    @BaseUrl() baseUrl: string,
    @Res() res: Response,
  ) {
    this.send(res, await this.share.postPage(postId, baseUrl));
  }

  @Get('r/:placeId')
  async place(
    @Param('placeId') placeId: string,
    @BaseUrl() baseUrl: string,
    @Res() res: Response,
  ) {
    this.send(res, await this.share.placePage(placeId, baseUrl));
  }

  @Get('u/:userId')
  async user(
    @Param('userId') userId: string,
    @BaseUrl() baseUrl: string,
    @Res() res: Response,
  ) {
    this.send(res, await this.share.userPage(userId, baseUrl));
  }

  /** Served as JSON with no redirect, as Apple requires. */
  @Get('.well-known/apple-app-site-association')
  aasa(@Res() res: Response) {
    res
      .status(200)
      .set({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      })
      .send(JSON.stringify(buildAppleAppSiteAssociation(readShareConfig())));
  }

  @Get('.well-known/assetlinks.json')
  assetLinks(@Res() res: Response) {
    res
      .status(200)
      .set({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      })
      .send(JSON.stringify(buildAssetLinks(readShareConfig())));
  }
}
