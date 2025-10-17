# Crunchy Food Discovery API - Backend Structure

This document outlines the complete NestJS backend structure generated from the `crunchy-api-spec.json` specification.

## Project Structure

```
src/
├── auth/                    # Authentication module
│   ├── dto/
│   │   ├── register.dto.ts
│   │   ├── login.dto.ts
│   │   └── social-login.dto.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
├── categories/              # Categories module
│   ├── categories.controller.ts
│   ├── categories.service.ts
│   └── categories.module.ts
├── posts/                   # Posts module
│   ├── dto/
│   │   ├── create-post.dto.ts
│   │   ├── update-post.dto.ts
│   │   ├── like-post.dto.ts
│   │   └── comment-post.dto.ts
│   ├── posts.controller.ts
│   ├── posts.service.ts
│   └── posts.module.ts
├── restaurants/             # Restaurants/Favorites module
│   ├── dto/
│   │   └── favorite-restaurant.dto.ts
│   ├── restaurants.controller.ts
│   ├── restaurants.service.ts
│   └── restaurants.module.ts
├── notifications/           # Notifications module
│   ├── notifications.controller.ts
│   ├── notifications.service.ts
│   └── notifications.module.ts
├── advertisements/          # Advertisements module
│   ├── advertisements.controller.ts
│   ├── advertisements.service.ts
│   └── advertisements.module.ts
├── common/                  # Common utilities
│   ├── dto/
│   │   └── pagination.dto.ts
│   └── interfaces/
│       └── api-response.interface.ts
├── app.module.ts
├── app.controller.ts
├── app.service.ts
└── main.ts
```

## API Endpoints

### Authentication

- `POST /register` - Register new user
- `POST /login` - User login
- `POST /socialLogin` - Social login

### Categories

- `GET /category-list` - Get all categories

### Posts

- `POST /post-save` - Create a new post
- `POST /post-update/{id}` - Update post by ID
- `DELETE /post-delete/{id}` - Delete post by ID
- `POST /post_like` - Like a post
- `POST /comment-post` - Comment on a post

### Restaurants

- `POST /favoriteplace` - Like a restaurant
- `GET /userfavoriteplace` - Get user's favorite restaurants

### Notifications

- `GET /getUserNotification` - Get all notifications for user

### Advertisements

- `GET /get-advertisements` - Fetch advertisements

## Features Implemented

### ✅ DTOs with Validation

- All DTOs use `class-validator` decorators for input validation
- Proper TypeScript types and validation rules
- Optional and required field validation

### ✅ Module Structure

- Organized into logical modules (Auth, Posts, Categories, etc.)
- Each module contains Controller, Service, and Module files
- Proper dependency injection and exports

### ✅ Global Validation

- Global validation pipe configured in `main.ts`
- Whitelist and forbidNonWhitelisted options enabled
- Automatic transformation of request data

### ✅ CORS Enabled

- CORS enabled for frontend integration
- Ready for cross-origin requests

## Dependencies Added

### Production Dependencies

- `class-validator` - DTO validation
- `class-transformer` - Object transformation
- `@nestjs/typeorm` - TypeORM integration
- `@nestjs/jwt` - JWT authentication
- `@nestjs/passport` - Passport integration
- `typeorm` - Database ORM
- `passport` - Authentication middleware
- `passport-jwt` - JWT strategy
- `passport-local` - Local strategy
- `bcryptjs` - Password hashing

### Development Dependencies

- `@types/bcryptjs` - TypeScript types for bcryptjs
- `@types/passport-jwt` - TypeScript types for passport-jwt
- `@types/passport-local` - TypeScript types for passport-local

## Next Steps

1. **Database Integration**: Add TypeORM entities and database configuration
2. **Authentication**: Implement JWT strategy and guards
3. **File Upload**: Add image upload functionality for posts
4. **Error Handling**: Implement global exception filters
5. **Logging**: Add proper logging with Winston or similar
6. **Testing**: Add unit and integration tests
7. **Documentation**: Generate OpenAPI/Swagger documentation
8. **Environment Configuration**: Add environment variables management

## Installation

```bash
npm install
```

## Running the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Testing

The application runs on `http://localhost:3000` by default. All endpoints are ready for testing with tools like Postman or curl.
