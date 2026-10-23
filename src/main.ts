import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import {
  ApiExceptionFilter,
  validationExceptionFactory,
} from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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

  // Serve static files for uploaded images
  app.useStaticAssets(join(__dirname, '..', 'storage'), {
    prefix: '/storage/',
  });

  // Serve legal pages (privacy policy, terms, data deletion) from public/
  const publicDir = join(__dirname, '..', 'public');
  app.useStaticAssets(publicDir);

  // Clean URLs without .html extension for legal pages
  const httpAdapter = app.getHttpAdapter();
  const sendLegalPage = (file: string) => (_req: unknown, res: any) =>
    res.sendFile(join(publicDir, file));
  httpAdapter.get('/privacy-policy', sendLegalPage('privacy-policy.html'));
  httpAdapter.get('/terms', sendLegalPage('terms.html'));
  httpAdapter.get('/data-deletion', sendLegalPage('data-deletion.html'));

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Crunchy Food Discovery API')
    .setDescription(
      'Backend API specification for Crunchy mobile app - A food discovery platform',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User authentication and management')
    .addTag('Posts', 'Food post management and interactions')
    .addTag('Restaurants', 'Restaurant and favorite place management')
    .addTag('Categories', 'Food category management')
    .addTag('Notifications', 'User notification management')
    .addTag('Advertisements', 'Advertisement management')
    .addTag('Social', 'Social features like follows and user interactions')
    .addTag('Media', 'Image and media upload management')
    .addTag('Search', 'Search and discovery features')
    .addTag('Settings', 'User preferences and app settings')
    .addTag('Session', 'Session management and tracking')
    .addTag('Feed', 'Home feed: nearby places and posts')
    .addTag('Places', 'Google Places proxy (key stays on the server)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0'); // Listen on all network interfaces for Android emulator access
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Application is also accessible from: http://0.0.0.0:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api/docs`);
}
function parseCorsOrigins(value?: string): string | string[] {
  const origins = (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origins.length || origins.includes('*')) return '*';
  return origins;
}

function parseTrustProxy(value?: string): boolean | number | string {
  const v = value?.trim();
  if (!v) return 'loopback';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

bootstrap();
