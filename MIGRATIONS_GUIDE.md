# 📦 Database Migrations Guide

## Overview

Database migrations ka proper setup ho gaya hai TypeORM ke saath. Ye production ke liye zaroori hai taake database schema changes controlled tareeqe se apply ho sakein.

## Migration Files

### Initial Migration Created ✅

File: `src/migrations/1700000000001-InitialSchema.ts`

Ye migration include karta hai:

- ✅ All 13 database tables
- ✅ Foreign key relationships
- ✅ Unique constraints
- ✅ Performance indexes
- ✅ Default values
- ✅ Cascade deletes

**Tables Created:**

1. `users` - User accounts
2. `categories` - Food categories
3. `restaurants` - Restaurant data
4. `posts` - User posts
5. `likes` - Post likes
6. `comments` - Post comments
7. `favorites` - Favorite restaurants
8. `follows` - User follows
9. `user_settings` - User preferences
10. `app_settings` - App configuration
11. `sessions` - User sessions
12. `notifications` - User notifications
13. `advertisements` - Ads data
14. `advertisement_views` - Ad view tracking

## Available Commands

### 1. Run Migrations (Production)

```bash
npm run migration:run
```

Ye command:

- Pending migrations ko run karega
- Database schema update karega
- Production ke liye safe hai

### 2. Revert Last Migration

```bash
npm run migration:revert
```

Ye command:

- Last migration ko undo karega
- Useful agar kuch galat ho jaye

### 3. Show Migration Status

```bash
npm run migration:show
```

Ye command dikhayega:

- Kon se migrations run ho chuke hain
- Kon se pending hain

### 4. Create New Migration

```bash
npm run migration:create src/migrations/YourMigrationName
```

New blank migration file create karega.

### 5. Generate Migration from Entities

```bash
npm run migration:generate src/migrations/YourMigrationName
```

Automatically entity changes se migration generate karega.

### 6. Seed Database

```bash
npm run seed
```

Database mein initial data (categories) add karega.

## Usage Scenarios

### Scenario 1: Fresh Database Setup (Development)

**Default mode - Auto synchronize:**

```bash
# .env file mein
USE_MIGRATIONS=false
NODE_ENV=development

# Start server
npm run start:dev
```

Tables automatically create honge.

### Scenario 2: Fresh Database Setup (Production)

**Migration mode:**

```bash
# .env file update karein
USE_MIGRATIONS=true
NODE_ENV=production

# Run migrations
npm run migration:run

# Seed categories
npm run seed

# Start server
npm run start:prod
```

### Scenario 3: Update Existing Database

```bash
# Run pending migrations
npm run migration:run

# Start server
npm run start:dev
```

### Scenario 4: Rollback Changes

```bash
# Agar last migration mein problem hai
npm run migration:revert

# Fix the migration file
# Then run again
npm run migration:run
```

## Environment Configuration

### Development Mode (Auto Sync)

`.env` file:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=crunchy_db
NODE_ENV=development
USE_MIGRATIONS=false
```

**Behavior:**

- TypeORM automatically tables create/update karega
- Fast development
- Database changes instantly reflect hoti hain

### Production Mode (Migrations)

`.env` file:

```env
DB_HOST=your-production-host
DB_PORT=5432
DB_USERNAME=your-prod-user
DB_PASSWORD=your-prod-password
DB_NAME=crunchy_db
NODE_ENV=production
USE_MIGRATIONS=true
```

**Behavior:**

- Sirf migrations se hi schema changes apply honge
- Controlled and safe
- Rollback possible hai

## Step-by-Step: First Time Setup

### Development Environment

```bash
# 1. Database create karein
createdb crunchy_db

# 2. .env configure karein
echo "USE_MIGRATIONS=false" >> .env
echo "NODE_ENV=development" >> .env

# 3. Server start karein (tables auto-create honge)
npm run start:dev

# 4. Categories seed karein
npm run seed
```

### Production Environment

```bash
# 1. Database create karein
createdb crunchy_db

# 2. .env configure karein
echo "USE_MIGRATIONS=true" >> .env
echo "NODE_ENV=production" >> .env

# 3. Migrations run karein
npm run migration:run

# 4. Check migration status
npm run migration:show

# 5. Seed categories
npm run seed

# 6. Start server
npm run start:prod
```

## Creating New Migrations

### When Entity Changes

Jab aap entities mein koi change karte ho:

```bash
# 1. Entity file edit karein
# Example: Add new field to User entity

# 2. Migration generate karein
npm run migration:generate src/migrations/AddNewFieldToUser

# 3. Generated file check karein
cat src/migrations/*-AddNewFieldToUser.ts

# 4. Migration run karein
npm run migration:run
```

### Manual Migration

Agar specific SQL queries likhni hain:

```bash
# 1. Blank migration create karein
npm run migration:create src/migrations/CustomMigration

# 2. File edit karein aur SQL add karein
# src/migrations/*-CustomMigration.ts

# 3. Run migration
npm run migration:run
```

## Migration File Structure

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class YourMigration1234567890 implements MigrationInterface {
  name = 'YourMigration1234567890';

  // Schema apply karne ke liye
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD "new_field" VARCHAR
    `);
  }

  // Schema revert karne ke liye
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "new_field"
    `);
  }
}
```

## Best Practices

### ✅ Do's

1. **Always test migrations locally first**

   ```bash
   npm run migration:run
   npm run migration:revert
   npm run migration:run
   ```

2. **Keep migrations small and focused**
   - One migration = one logical change
   - Easier to debug
   - Easier to rollback

3. **Always write down() method**
   - Rollback capability important hai
   - Production mein useful

4. **Check migration status before deploying**

   ```bash
   npm run migration:show
   ```

5. **Backup database before migrations**
   ```bash
   pg_dump crunchy_db > backup.sql
   ```

### ❌ Don'ts

1. **Don't edit executed migrations**
   - Executed migration ko kabhi edit mat karo
   - New migration create karo

2. **Don't skip migrations**
   - Sare migrations order mein run hone chahiye

3. **Don't use synchronize in production**
   - Always use migrations in production
   - Synchronize data loss cause kar sakta hai

## Troubleshooting

### Migration Fails

```bash
# Check error logs
npm run migration:run

# If error, revert
npm run migration:revert

# Fix the issue
# Try again
npm run migration:run
```

### Migration Already Executed

```bash
# Check status
npm run migration:show

# If already executed, create new migration
npm run migration:create src/migrations/NewChanges
```

### Database Out of Sync

```bash
# Check current state
npm run migration:show

# Revert all
npm run migration:revert # Multiple times if needed

# Or recreate database
dropdb crunchy_db
createdb crunchy_db

# Run all migrations fresh
npm run migration:run
npm run seed
```

### Connection Error

```bash
# Check PostgreSQL is running
pg_isready

# Check .env file
cat .env

# Test connection
psql -U postgres -d crunchy_db -c "SELECT 1;"
```

## Quick Reference

| Command                      | Purpose                    |
| ---------------------------- | -------------------------- |
| `npm run migration:run`      | Execute pending migrations |
| `npm run migration:revert`   | Undo last migration        |
| `npm run migration:show`     | Show migration status      |
| `npm run migration:create`   | Create blank migration     |
| `npm run migration:generate` | Generate from entities     |
| `npm run seed`               | Seed categories            |

## Deployment Checklist

### Before Deployment

- [ ] All migrations tested locally
- [ ] Migration rollback tested
- [ ] Database backup taken
- [ ] .env configured for production
- [ ] USE_MIGRATIONS=true set

### During Deployment

```bash
# 1. Stop application
pm2 stop crunchy-backend

# 2. Backup database
pg_dump crunchy_db > backup-$(date +%Y%m%d).sql

# 3. Run migrations
npm run migration:run

# 4. Verify
npm run migration:show

# 5. Start application
npm run start:prod
```

### After Deployment

- [ ] Check application logs
- [ ] Test critical features
- [ ] Monitor for errors
- [ ] Keep backup for 7 days

## Summary

### Development

- Use `synchronize: true` (default)
- Fast iteration
- Auto-creates tables

### Production

- Use `USE_MIGRATIONS=true`
- Controlled schema changes
- Safe and reversible

### Common Commands

```bash
# Setup
npm run migration:run
npm run seed

# Development
npm run start:dev

# Production
npm run start:prod
```

---

**Migration system ab fully ready hai! Development aur Production dono ke liye safe database management ho sakti hai.** 🚀
