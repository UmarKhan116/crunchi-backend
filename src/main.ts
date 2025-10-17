import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for mobile app
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type,Authorization,Accept',
  });

  // Serve static files for uploaded images
  app.useStaticAssets(join(__dirname, '..', 'storage'), {
    prefix: '/storage/',
  });

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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api/docs`);
}
bootstrap();
