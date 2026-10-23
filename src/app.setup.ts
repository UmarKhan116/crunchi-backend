import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
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
