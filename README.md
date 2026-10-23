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

- Node.js 20 LTS (18 minimum) and npm
- PostgreSQL 14+ (local install, Docker, or a hosted instance such as AWS RDS)
- Docker + Docker Compose (optional, only if you want to run Postgres in a container)

### Running the backend locally

1. **Clone the repository and install dependencies**

   ```bash
   git clone https://github.com/UmarKhan116/crunchi-backend.git
   cd crunchi-backend
   npm install
   ```

2. **Create the `.env` file**

   ```bash
   cp env.example .env
   ```

   Then fill in the values:

   | Variable | Description | Example |
   | --- | --- | --- |
   | `DB_HOST` | Postgres host | `localhost` |
   | `DB_PORT` | Postgres port | `5432` |
   | `DB_USERNAME` | Postgres user | `postgres` |
   | `DB_PASSWORD` | Postgres password | `postgres123` |
   | `DB_NAME` | Database name | `crunchy_db` |
   | `JWT_SECRET` | Secret used to sign JWTs. Use a long random string | `openssl rand -hex 32` |
   | `JWT_EXPIRES_IN` | Token lifetime | `7d` |
   | `NODE_ENV` | `development` or `production` | `development` |
   | `PORT` | Port the API listens on (defaults to `3000`) | `3000` |
   | `USE_MIGRATIONS` | `true` runs migrations on startup; `false` auto-syncs the schema in development | `false` |
   | `GOOGLE_PLACES_API_KEY` | Google Places API key | |
   | `UPLOAD_PATH` | Upload directory | `./storage` |
   | `MAX_FILE_SIZE` | Max upload size in bytes | `10485760` |
   | `CORS_ORIGIN` | Allowed origin (the app currently allows `*`) | `*` |
   | `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON on a single line, used for push notifications | `'{"type":"service_account",...}'` |

3. **Start PostgreSQL**

   Choose one of these options:

   - **Docker** (uses the bundled [docker-compose.yml](docker-compose.yml): database `crunchy_db`, user `postgres`, password `postgres123`, port `5432`):

     ```bash
     docker compose up -d postgres
     ```

   - **Local install**:

     ```bash
     createdb crunchy_db
     ```

   - **Hosted (RDS, etc.)**: point the `DB_*` variables at the remote instance.

   > ⚠️ **SSL note:** [src/config/database.config.ts](src/config/database.config.ts) and [src/config/typeorm.config.ts](src/config/typeorm.config.ts) always connect with `ssl: { rejectUnauthorized: false }`. That works with RDS. A plain local or Docker Postgres has no SSL, so the connection fails with `The server does not support SSL connections`. For local development, temporarily set `ssl: false` in both files, and don't commit that change.

4. **Create the database schema**

   - **Development**: with `NODE_ENV=development` and `USE_MIGRATIONS=false`, TypeORM `synchronize` creates and updates tables automatically on startup.
   - **Migrations** (recommended for shared and production databases):

     ```bash
     npm run migration:show   # list applied/pending migrations
     npm run migration:run    # apply pending migrations
     ```

5. **Seed initial data** (food categories and the default admin user)

   ```bash
   npm run seed
   ```

   The seed copies images from `category-images/` into `storage/category/` and creates an admin account (`admin@admin.com`, password set in [src/database/seed.ts](src/database/seed.ts)). Change that password after the first login.

6. **Run the API**

   ```bash
   # Watch mode (auto-reload)
   npm run start:dev

   # Debug mode (attach a debugger on port 9229)
   npm run start:debug

   # Production build, run locally
   npm run build
   npm run start:prod
   ```

7. **Verify it's running**

   - API base: `http://localhost:<PORT>/api`
   - Swagger UI: `http://localhost:<PORT>/api/docs`
   - Uploaded files: `http://localhost:<PORT>/storage/...`
   - Legal pages: `/privacy-policy`, `/terms`, `/data-deletion`

   The server listens on `0.0.0.0`, so the Android emulator (`http://10.0.2.2:<PORT>`) and physical devices on the same Wi‑Fi (`http://<your-LAN-IP>:<PORT>`) can reach it.

### Database migrations

```bash
# Generate a migration from entity changes
npm run migration:generate -- src/migrations/<MigrationName>

# Create an empty migration
npm run migration:create -- src/migrations/<MigrationName>

# Apply / revert / inspect
npm run migration:run
npm run migration:revert
npm run migration:show
```

Migration commands read DB settings from `.env` through [src/config/typeorm.config.ts](src/config/typeorm.config.ts).

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

CORS origins come from `CORS_ORIGINS` (comma-separated). When it is unset or `*`, every origin is allowed.

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Database tests (throwaway Postgres only)

`npm run test:db` rebuilds the schema from every migration, checks the
migrations up and down (no drift against the entities), the SQL distance
queries, cascades, the push outbox (SKIP LOCKED claims, retries), and drives
every Milestone 1 and 2 endpoint over HTTP with Google (`fetch`) and
`firebase-admin` mocked. It reads `TEST_DB_*` only and never loads `.env`; it
**drops the `public` schema** of the database it points at.

```bash
docker run -d --rm --name be-m2-pg -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=crunchy_test -p 55432:5432 postgres:16
TEST_DB_PORT=55432 npm run test:db
# Show what migration:generate would still change (should be nothing):
TEST_DB_PORT=55432 npx ts-node test/db/schema-diff.ts
docker stop be-m2-pg
```

### Push notifications (Milestone 2)

Notifications are saved together with a `push_outbox` row; a worker in the
API process (`@nestjs/schedule`, every 2 s) claims rows with
`FOR UPDATE SKIP LOCKED`, sends them to every `device_tokens` row of the user
with FCM, deletes dead tokens and retries failures 3 times (5/20/80 s).
`PUSH_WORKER_ENABLED=false` turns the worker off on an instance.

### HEIC uploads

`POST /api/imageupload` converts HEIC/HEIF photos to JPEG with
`heic-convert` (pure JavaScript, run in a worker thread). Sharp's prebuilt
binaries cannot decode HEIC, so it is not used. If `heic-convert` is missing,
HEIC uploads are rejected with 415.

## 📝 Code Quality

```bash
# Linting
npm run lint

# Formatting
npm run format
```

## 🚀 Deployment

Production runs on a Linux VM (e.g. AWS EC2, Ubuntu 22.04+) with PostgreSQL on AWS RDS. The API is served at `https://api.crunchiiapp.com`, which is the URL the mobile app uses. The steps below cover a fresh server with **PM2** (process manager), **Nginx** (reverse proxy) and **Let's Encrypt** (HTTPS).

### 1. Prepare the server

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

# PM2
sudo npm install -g pm2
```

Open ports `22`, `80` and `443` in the instance security group. Don't expose the app port, because Nginx proxies to it. Also allow the server to reach RDS on `5432` in the RDS security group.

### 2. Get the code and install

```bash
cd ~
git clone https://github.com/UmarKhan116/crunchi-backend.git
cd crunchi-backend
npm ci
```

> Install dev dependencies too (`npm ci`, not `npm ci --omit=dev`). `npm run build`, `npm run seed` and the migration scripts need the Nest CLI, `ts-node` and TypeScript.

### 3. Configure production environment

Create `.env` on the server. Never commit it.

```env
NODE_ENV=production
PORT=3003
USE_MIGRATIONS=true

DB_HOST=<your-rds-endpoint>.rds.amazonaws.com
DB_PORT=5432
DB_USERNAME=<db-user>
DB_PASSWORD=<db-password>
DB_NAME=<db-name>

JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=7d

GOOGLE_PLACES_API_KEY=<key>
UPLOAD_PATH=./storage
MAX_FILE_SIZE=10485760
CORS_ORIGIN=*
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account", ...}'
```

With `NODE_ENV=production`, schema `synchronize` is disabled. With `USE_MIGRATIONS=true`, pending migrations run automatically when the app starts.

### 4. Build, migrate, seed (first deploy only) and start

```bash
npm run build
npm run migration:run      # optional, startup also runs them when USE_MIGRATIONS=true
npm run seed               # first deploy only

pm2 start dist/main.js --name crunchi-api
pm2 save
pm2 startup                # run the command it prints so PM2 restarts on reboot
```

Useful PM2 commands: `pm2 logs crunchi-api`, `pm2 restart crunchi-api`, `pm2 status`.

### 5. Nginx reverse proxy

`/etc/nginx/sites-available/crunchi-api`:

```nginx
server {
    listen 80;
    server_name api.crunchiiapp.com;

    client_max_body_size 50M;   # allow image/video uploads

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/crunchi-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Point the `api.crunchiiapp.com` DNS **A record** at the server's public IP (use an Elastic IP so it doesn't change).

### 6. HTTPS

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.crunchiiapp.com
```

Certbot sets up automatic renewal.

### 7. Deploying updates

```bash
cd ~/crunchi-backend
git pull
npm ci
npm run build
pm2 restart crunchi-api
```

If the update adds migrations, the restart applies them (`USE_MIGRATIONS=true`). You can also run `npm run migration:run` before restarting.

### Important production notes

- **Uploaded files live on local disk** in `storage/` (served at `/storage/`). Back this folder up, and keep it in place when you redeploy or move servers. Don't delete the project folder to redeploy.
- **Back up the database** with RDS automated snapshots. For a self-hosted Postgres from `docker-compose.yml`, use `pg_dump` into the mounted `./postgres_backup` folder.
- After deploying, check `https://api.crunchiiapp.com/api/docs` and `https://api.crunchiiapp.com/privacy-policy`. The mobile app and the store listings depend on these URLs.
- Change the Postgres password in `docker-compose.yml` before using it on a public server. It also binds `5432` on `0.0.0.0`, so restrict that port in the firewall.

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
