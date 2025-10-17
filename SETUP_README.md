# Crunchy Food Discovery Backend - Setup Guide

## Overview

This is the complete NestJS backend implementation for the Crunchy Food Discovery mobile application. All 33 API endpoints are fully implemented with proper authentication, database integration, and file handling.

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

#### Option A: Using PostgreSQL locally

1. Install PostgreSQL if not already installed
2. Create a new database:

```sql
CREATE DATABASE crunchy_db;
```

3. The `.env` file is already configured with default values:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=crunchy_db
```

Update these values according to your PostgreSQL setup.

#### Option B: Using Docker

```bash
docker run --name crunchy-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=crunchy_db \
  -p 5432:5432 \
  -d postgres:14
```

### 3. Configure Environment Variables

The `.env` file is already created with default values. Update if needed:

- `JWT_SECRET`: Change to a secure random string in production
- `DB_*`: Update database credentials
- `GOOGLE_PLACES_API_KEY`: Your Google API key (already configured)

### 4. Run Database Migrations

TypeORM will automatically create tables when you start the application (synchronize: true in development).

### 5. Seed the Database

Seed initial categories:

```bash
npx ts-node src/database/seed.ts
```

### 6. Start the Application

#### Development Mode

```bash
npm run start:dev
```

The server will start on http://localhost:3000

#### Production Mode

```bash
npm run build
npm run start:prod
```

### 7. Verify Installation

- API Documentation: http://localhost:3000/api/docs
- Health Check: http://localhost:3000

## API Endpoints

### Authentication (3 endpoints)

- `POST /api/register` - Register new user
- `POST /api/login` - User login
- `POST /api/socialLogin` - Social media login
- `POST /api/forgot` - Password reset
- `GET /api/profile` - Get user profile
- `POST /api/update_profile` - Update user profile
- `GET /api/user_status/:userId` - Get user account status

### Posts (9 endpoints)

- `POST /api/post-save` - Create a new post
- `GET /api/get_post/:id` - Get post by ID
- `POST /api/post-update/:id` - Update post
- `DELETE /api/post-delete/:id` - Delete post
- `POST /api/index-distance` - Get posts by location
- `POST /api/post_like` - Like/unlike a post
- `POST /api/comment-post` - Comment on a post
- `GET /api/likes_mypost` - Get user's liked posts
- `GET /api/favorite-post` - Get user's favorite posts

### Restaurants (7 endpoints)

- `POST /api/favoriteplace` - Like/unlike a restaurant
- `GET /api/userfavoriteplace` - Get user's favorite restaurants
- `GET /api/getFavoriteRestaurantsByUserId/:userId` - Get user's favorites
- `POST /api/googlemedia` - Save Google Places data
- `GET /api/get_google_post/:restaurant_id` - Get Google Places data
- `POST /api/googlelike` - Like a Google Place
- `GET /api/userlikedgooglepost` - Get user's liked Google Places

### Media (3 endpoints)

- `POST /api/imageupload` - Upload image
- `POST /api/removeImage` - Remove uploaded image
- `GET /api/get_media/:restaurant_id` - Get restaurant media

### Categories (1 endpoint)

- `GET /api/category-list` - Get all categories

### Settings (3 endpoints)

- `POST /api/user-setting` - Save user preferences
- `GET /api/get-app-settings` - Get app settings
- `POST /api/app-setting` - Save app settings

### Social (2 endpoints)

- `POST /api/user-follows` - Follow/unfollow a user
- `GET /api/other_get_user/:userID` - Get other user's profile

### Search (1 endpoint)

- `GET /api/search/:query` - Search users

### Notifications (1 endpoint)

- `GET /api/getUserNotification` - Get user notifications

### Advertisements (2 endpoints)

- `GET /api/get-advertisements` - Get advertisements
- `POST /api/advertisement-view` - Track advertisement view

### Session (1 endpoint)

- `POST /api/session` - Track user session

## File Structure

```
src/
├── advertisements/     # Advertisement management
├── auth/              # Authentication & user management
├── categories/        # Food categories
├── common/            # Shared DTOs and interfaces
├── config/            # Database configuration
├── database/          # Seed scripts
├── entities/          # TypeORM entities
├── media/             # Image upload & management
├── notifications/     # User notifications
├── posts/             # Post CRUD & interactions
├── restaurants/       # Restaurant favorites & Google Places
├── search/            # User search
├── session/           # Session tracking
├── settings/          # User & app settings
├── social/            # Follow/unfollow functionality
└── main.ts           # Application entry point

storage/              # Uploaded files directory
├── uploads/          # User profile images
├── User/             # Category images
└── video/            # Advertisement videos
```

## Testing the APIs

### Using Swagger UI

1. Navigate to http://localhost:3000/api/docs
2. Click "Authorize" and enter your JWT token
3. Test any endpoint

### Using the Mobile App

1. Update the React Native app's `BASE_URL` in `src/Constants/apiHandler.js`:

For Android Emulator:

```javascript
export const BASE_URL = 'http://10.0.2.2:3000/api/';
```

For iOS Simulator:

```javascript
export const BASE_URL = 'http://localhost:3000/api/';
```

For Physical Device:

```javascript
export const BASE_URL = 'http://YOUR_COMPUTER_IP:3000/api/';
```

2. Start the backend server
3. Run the React Native app

### Using Postman/cURL

Example: Register a user

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User"
  }'
```

## Important Notes

### Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

### File Uploads

- Supported formats: JPEG, JPG, PNG, GIF
- Max file size: 10MB
- Files are stored in `./storage/` directory
- Access uploaded files via: `http://localhost:3000/storage/filename.jpg`

### Database

- TypeORM synchronize is enabled in development (auto-creates tables)
- Disable synchronize in production and use migrations
- Regular backups recommended

### Security

- Change `JWT_SECRET` in production
- Use HTTPS in production
- Update CORS settings for production domains
- Implement rate limiting for production

## Troubleshooting

### Database Connection Issues

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

Solution: Ensure PostgreSQL is running:

```bash
# Check PostgreSQL status
pg_ctl status

# Start PostgreSQL
pg_ctl start
```

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

Solution: Change the port in `.env`:

```env
PORT=3001
```

### File Upload Issues

Ensure the `storage` directories exist:

```bash
mkdir -p storage storage/uploads storage/User storage/video
```

### JWT Verification Failed

Ensure the JWT_SECRET in `.env` matches the one used to generate tokens.

## Development Scripts

```bash
# Development mode with hot reload
npm run start:dev

# Build for production
npm run build

# Run production build
npm run start:prod

# Run linting
npm run lint

# Run tests
npm run test

# Seed database
npx ts-node src/database/seed.ts
```

## API Response Format

All APIs return consistent response formats:

Success:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

Error:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Next Steps

1. ✅ Backend server is running
2. ✅ Database is connected and seeded
3. ✅ All APIs are implemented
4. Test with React Native app
5. Deploy to production server
6. Set up monitoring and logging
7. Implement caching (Redis)
8. Add rate limiting
9. Set up CI/CD pipeline

## Support

For issues or questions:

- Check Swagger documentation: http://localhost:3000/api/docs
- Review logs in console
- Check database connection
- Verify environment variables

## License

Private - All Rights Reserved
