import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import {
  ApiExceptionFilter,
  validationExceptionFactory,
} from './common/filters/api-exception.filter';

/**
 * Global pipes, filters, proxy trust and CORS. Shared by main.ts and the
 * e2e tests so both run the same request pipeline.
 */
export function configureApp(app: NestExpressApplication) {
  const env = app.get(ConfigService);

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Contract error envelope: { success: false, message, errors? }
  app.useGlobalFilters(new ApiExceptionFilter());

  // Client IPs for the login rate limit. 'loopback' trusts X-Forwarded-For
  // only from a proxy on the same host (nginx); set TRUST_PROXY to a hop
  // count or subnet list if the proxy is elsewhere.
  app.set('trust proxy', parseTrustProxy(env.get('TRUST_PROXY')));

  // CORS: comma-separated CORS_ORIGINS, or '*' when unset.
  app.enableCors({
    origin: parseCorsOrigins(env.get('CORS_ORIGINS')),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type,Authorization,Accept',
  });
}

/**
 * Static files and legal pages (main.ts and the HTTP tests). Express runs
 * these before Nest's routes, so nothing here may claim the share paths
 * (/p, /r, /u, /.well-known): public/ has no such folders, and
 * express.static ignores dot-folders such as .well-known.
 */
export function configureStaticAssets(app: NestExpressApplication) {
  // Uploaded images and videos
  app.useStaticAssets(join(__dirname, '..', 'storage'), {
    prefix: '/storage/',
  });

  // Legal pages (privacy policy, terms, data deletion) from public/
  const publicDir = join(__dirname, '..', 'public');
  app.useStaticAssets(publicDir, { redirect: false });

  // Clean URLs without .html extension for legal pages
  const httpAdapter = app.getHttpAdapter();
  const sendLegalPage = (file: string) => (_req: unknown, res: any) =>
    res.sendFile(join(publicDir, file));
  httpAdapter.get('/privacy-policy', sendLegalPage('privacy-policy.html'));
  httpAdapter.get('/terms', sendLegalPage('terms.html'));
  httpAdapter.get('/data-deletion', sendLegalPage('data-deletion.html'));
}

export function parseCorsOrigins(value?: string): string | string[] {
  const origins = (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origins.length || origins.includes('*')) return '*';
  return origins;
}

export function parseTrustProxy(value?: string): boolean | number | string {
  const v = value?.trim();
  if (!v) return 'loopback';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
