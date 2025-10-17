# Crunchy Food Discovery API

A comprehensive NestJS backend API for the Crunchy food discovery mobile app that allows users to discover restaurants, share food posts, and connect with other food enthusiasts.

## 🚀 Features

### Authentication & User Management

- User registration and login
- Social login (Google, Facebook, Apple)
- Password reset functionality
- User profile management
- Account status management

### Post Management

- Create, update, and delete food posts
- Like and comment on posts
- Location-based post discovery
- Image upload for posts
- Get posts by ID and location

### Social Features

- Follow/unfollow users
- Get user profiles and data
- User search functionality
- Social interactions and feeds

### Restaurant & Location Services

- Save favorite restaurants
- Google Places API integration
- Location-based restaurant discovery
- Restaurant media management

### Additional Features

- Food category management
- User notifications
- Advertisement management
- User preferences and settings
- Session tracking
- Image and media upload

## 🏗️ Architecture

### Database Schema

The system includes the following TypeORM entities:

1. **Users** - User profiles and authentication data
2. **Posts** - Food posts with media, ratings, and location
3. **Comments** - Post comments and replies
4. **Likes** - Post likes and user interactions
5. **Restaurants** - Restaurant information and Google Places data
6. **Favorites** - User favorite restaurants
7. **Follows** - User follow relationships
8. **Categories** - Food categories and preferences
9. **Sessions** - User session tracking
10. **Advertisements** - Ad content and tracking
11. **AdvertisementViews** - Advertisement view tracking
12. **UserSettings** - User preferences and settings
13. **AppSettings** - Global app settings

### Module Structure

```
src/
├── auth/                    # Authentication module
├── categories/              # Categories module
├── posts/                   # Posts module
├── restaurants/             # Restaurants module
├── notifications/           # Notifications module
├── advertisements/          # Advertisements module
├── media/                   # Media upload module
├── social/                  # Social features module
├── search/                  # Search functionality module
├── settings/                # User and app settings module
├── session/                 # Session management module
├── entities/                # TypeORM entities
├── config/                  # Database configuration
└── common/                  # Common utilities and DTOs
```

## 📋 API Endpoints

### Authentication (`/api`)

- `POST /register` - Register new user
- `POST /login` - User login
- `POST /socialLogin` - Social login
- `POST /forgot` - Password reset request
- `GET /profile` - Get user profile
- `POST /update_profile` - Update user profile
- `GET /user_status/:userId` - Get user account status

### Posts (`/api`)

- `POST /post-save` - Create a new post
- `GET /get_post/:id` - Get post by ID
- `POST /post-update/:id` - Update post by ID
- `DELETE /post-delete/:id` - Delete post by ID
- `POST /index-distance` - Get posts by location distance
- `POST /post_like` - Like/unlike a post
- `POST /comment-post` - Comment on a post
- `GET /likes_mypost` - Get user liked posts

### Restaurants (`/api`)

- `POST /favoriteplace` - Like a restaurant
- `GET /userfavoriteplace` - Get user's favorite restaurants
- `GET /getFavoriteRestaurantsByUserId/:userId` - Get favorites by user ID
- `POST /googlemedia` - Google Places integration
- `GET /get_google_post/:restaurant_id` - Get Google Places data

### Categories (`/api`)

- `GET /category-list` - Get all categories

### Social (`/api`)

- `POST /user-follows` - Follow/unfollow a user
- `GET /other_get_user/:userID` - Get other user data

### Search (`/api`)

- `GET /search/:query` - Search users

### Media (`/api`)

- `POST /imageupload` - Upload image
- `GET /get_media/:restaurant_id` - Get restaurant media

### Settings (`/api`)

- `POST /user-setting` - Save user preferences
- `GET /get-app-settings` - Get app settings
- `POST /app-setting` - Save app settings

### Session (`/api`)

- `POST /session` - Track user session

### Notifications (`/api`)

- `GET /getUserNotification` - Get user notifications

### Advertisements (`/api`)

- `GET /get-advertisements` - Get advertisements
- `POST /advertisement-view` - Track advertisement view

## 🛠️ Technology Stack

- **Framework**: NestJS
- **Database**: PostgreSQL with TypeORM
- **Validation**: class-validator & class-transformer
- **Authentication**: JWT with Passport
- **Documentation**: Swagger/OpenAPI
- **File Upload**: Multer
- **Environment**: ConfigModule

## 📦 Dependencies

### Production Dependencies

```json
{
  "@nestjs/common": "^10.0.0",
  "@nestjs/core": "^10.0.0",
  "@nestjs/platform-express": "^10.0.0",
  "@nestjs/typeorm": "^10.0.0",
  "@nestjs/jwt": "^10.0.0",
  "@nestjs/passport": "^10.0.0",
  "@nestjs/swagger": "^7.1.0",
  "@nestjs/config": "^3.0.0",
  "class-validator": "^0.14.0",
  "class-transformer": "^0.5.1",
  "typeorm": "^0.3.17",
  "pg": "^8.11.3",
  "passport": "^0.6.0",
  "passport-jwt": "^4.0.1",
  "passport-local": "^1.0.0",
  "bcryptjs": "^2.4.3",
  "multer": "^1.4.5-lts.1"
}
```

### Development Dependencies

```json
{
  "@types/bcryptjs": "^2.4.2",
  "@types/passport-jwt": "^3.0.6",
  "@types/passport-local": "^1.0.35",
  "@types/pg": "^8.10.2",
  "@types/multer": "^1.4.7"
}
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd crunchy_backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Configuration**

   ```bash
   cp env.example .env
   ```

   Update the `.env` file with your configuration:

   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=your-password
   DB_NAME=crunchy_db

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d

   # App Configuration
   NODE_ENV=development
   PORT=3000

   # Google Places API
   GOOGLE_PLACES_API_KEY=your-google-places-api-key

   # File Upload Configuration
   UPLOAD_PATH=./uploads
   MAX_FILE_SIZE=10485760

   # CORS Configuration
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Database Setup**

   ```bash
   # Create PostgreSQL database
   createdb crunchy_db

   # The application will automatically create tables on startup in development mode
   ```

5. **Run the application**

   ```bash
   # Development mode
   npm run start:dev

   # Production mode
   npm run build
   npm run start:prod
   ```

## 📚 API Documentation

Once the application is running, you can access the interactive Swagger documentation at:

- **Swagger UI**: `http://localhost:3000/api/docs`

The documentation includes:

- Complete API endpoint descriptions
- Request/response schemas
- Authentication requirements
- Example requests and responses
- Interactive testing capabilities

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```bash
Authorization: Bearer <your-jwt-token>
```

## 📁 File Upload

The API supports image uploads for posts and user profiles. Files are handled using Multer middleware with validation for file types and sizes.

## 🌍 CORS Configuration

CORS is enabled for frontend integration. Update the `CORS_ORIGIN` environment variable to match your frontend URL.

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📝 Code Quality

```bash
# Linting
npm run lint

# Formatting
npm run format
```

## 🚀 Deployment

1. **Build the application**

   ```bash
   npm run build
   ```

2. **Set production environment variables**

   ```bash
   NODE_ENV=production
   DB_HOST=your-production-db-host
   # ... other production variables
   ```

3. **Run in production**
   ```bash
   npm run start:prod
   ```

## 🔧 Development

### Project Structure

- **Controllers**: Handle HTTP requests and responses
- **Services**: Contain business logic
- **DTOs**: Data Transfer Objects with validation
- **Entities**: TypeORM database models
- **Modules**: Organize related functionality

### Adding New Features

1. Create entity in `src/entities/`
2. Create DTOs with validation in module's `dto/` folder
3. Create service with business logic
4. Create controller with endpoints
5. Create module and add to `app.module.ts`
6. Add Swagger documentation decorators

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions, please create an issue in the repository or contact the development team.

---

**Happy Coding! 🎉**
