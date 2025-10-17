import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000001 implements MigrationInterface {
  name = 'InitialSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR UNIQUE NOT NULL,
        "password" VARCHAR NOT NULL,
        "full_name" VARCHAR,
        "user_name" VARCHAR,
        "profile_picture" VARCHAR,
        "bio" VARCHAR,
        "location" VARCHAR,
        "device_token" VARCHAR,
        "is_active" BOOLEAN DEFAULT true,
        "is_verified" BOOLEAN DEFAULT false,
        "social_id" VARCHAR,
        "social_provider" VARCHAR,
        "reset_password_token" VARCHAR,
        "reset_password_expires" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create categories table
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR NOT NULL,
        "description" VARCHAR,
        "icon" VARCHAR,
        "color" VARCHAR,
        "is_active" BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create restaurants table
    await queryRunner.query(`
      CREATE TABLE "restaurants" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR NOT NULL,
        "description" VARCHAR,
        "address" VARCHAR,
        "latitude" DECIMAL(10,8),
        "longitude" DECIMAL(11,8),
        "phone" VARCHAR,
        "website" VARCHAR,
        "google_rating" DECIMAL(2,1),
        "app_rating" DECIMAL(2,1),
        "google_place_id" VARCHAR,
        "google_photo_reference" VARCHAR,
        "google_photos" JSON,
        "cuisines" JSON,
        "price_level" VARCHAR,
        "is_active" BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create posts table
    await queryRunner.query(`
      CREATE TABLE "posts" (
        "id" SERIAL PRIMARY KEY,
        "description" TEXT NOT NULL,
        "images" JSON,
        "location" VARCHAR,
        "latitude" DECIMAL(10,8),
        "longitude" DECIMAL(11,8),
        "rating" DECIMAL(2,1),
        "likes_count" INTEGER DEFAULT 0,
        "comments_count" INTEGER DEFAULT 0,
        "is_active" BOOLEAN DEFAULT true,
        "user_id" INTEGER NOT NULL,
        "category_id" INTEGER NOT NULL,
        "restaurant_id" INTEGER,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_post_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_post_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id"),
        CONSTRAINT "fk_post_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
      )
    `);

    // Create likes table
    await queryRunner.query(`
      CREATE TABLE "likes" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL,
        "post_id" INTEGER NOT NULL,
        "created_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_like_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_like_post" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_user_post" UNIQUE ("user_id", "post_id")
      )
    `);

    // Create comments table
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" SERIAL PRIMARY KEY,
        "comment" TEXT NOT NULL,
        "user_id" INTEGER NOT NULL,
        "post_id" INTEGER NOT NULL,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_comment_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_comment_post" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE
      )
    `);

    // Create favorites table
    await queryRunner.query(`
      CREATE TABLE "favorites" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL,
        "restaurant_id" INTEGER NOT NULL,
        "created_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_favorite_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_favorite_restaurant" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_user_restaurant" UNIQUE ("user_id", "restaurant_id")
      )
    `);

    // Create follows table
    await queryRunner.query(`
      CREATE TABLE "follows" (
        "id" SERIAL PRIMARY KEY,
        "follower_id" INTEGER NOT NULL,
        "following_id" INTEGER NOT NULL,
        "created_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_follow_follower" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_follow_following" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_follower_following" UNIQUE ("follower_id", "following_id")
      )
    `);

    // Create user_settings table
    await queryRunner.query(`
      CREATE TABLE "user_settings" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER UNIQUE NOT NULL,
        "notifications_enabled" BOOLEAN DEFAULT true,
        "location_sharing" BOOLEAN DEFAULT true,
        "profile_visibility" BOOLEAN DEFAULT true,
        "language" VARCHAR DEFAULT 'en',
        "distance_unit" VARCHAR DEFAULT 'km',
        "search_radius" DECIMAL(3,1) DEFAULT 10.0,
        "favorite_categories" JSON,
        "dietary_preferences" JSON,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_user_settings_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create app_settings table
    await queryRunner.query(`
      CREATE TABLE "app_settings" (
        "id" SERIAL PRIMARY KEY,
        "key" VARCHAR NOT NULL,
        "value" TEXT NOT NULL,
        "description" VARCHAR,
        "is_active" BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create sessions table
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" SERIAL PRIMARY KEY,
        "session_id" VARCHAR NOT NULL,
        "user_id" INTEGER NOT NULL,
        "device_type" VARCHAR,
        "device_token" VARCHAR,
        "ip_address" VARCHAR,
        "user_agent" VARCHAR,
        "is_active" BOOLEAN DEFAULT true,
        "last_activity" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_session_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create notifications table
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL,
        "type" VARCHAR NOT NULL,
        "message" TEXT NOT NULL,
        "data" JSON,
        "is_read" BOOLEAN DEFAULT false,
        "created_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_notification_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create advertisements table
    await queryRunner.query(`
      CREATE TABLE "advertisements" (
        "id" SERIAL PRIMARY KEY,
        "title" VARCHAR NOT NULL,
        "description" VARCHAR,
        "image_url" VARCHAR NOT NULL,
        "link_url" VARCHAR,
        "views_count" INTEGER DEFAULT 0,
        "clicks_count" INTEGER DEFAULT 0,
        "is_active" BOOLEAN DEFAULT true,
        "target_audience" VARCHAR,
        "budget" INTEGER,
        "start_date" TIMESTAMP,
        "end_date" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create advertisement_views table
    await queryRunner.query(`
      CREATE TABLE "advertisement_views" (
        "id" SERIAL PRIMARY KEY,
        "advertisement_id" INTEGER NOT NULL,
        "user_id" INTEGER NOT NULL,
        "view_count" INTEGER DEFAULT 0,
        "click_count" INTEGER DEFAULT 0,
        "created_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "fk_ad_view_advertisement" FOREIGN KEY ("advertisement_id") REFERENCES "advertisements"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ad_view_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_ad_user" UNIQUE ("advertisement_id", "user_id")
      )
    `);

    // Create indexes for better performance
    await queryRunner.query(
      `CREATE INDEX "idx_posts_user_id" ON "posts" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_category_id" ON "posts" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_restaurant_id" ON "posts" ("restaurant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_created_at" ON "posts" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_likes_user_id" ON "likes" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_likes_post_id" ON "likes" ("post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_comments_post_id" ON "comments" ("post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_favorites_user_id" ON "favorites" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follows_follower_id" ON "follows" ("follower_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follows_following_id" ON "follows" ("following_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user_id" ON "notifications" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_restaurants_google_place_id" ON "restaurants" ("google_place_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_restaurants_google_place_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sessions_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_follows_following_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_follows_follower_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_favorites_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comments_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_likes_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_likes_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_posts_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_posts_restaurant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_posts_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_posts_user_id"`);

    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE IF EXISTS "advertisement_views"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "advertisements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "follows"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "favorites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "likes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "posts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "restaurants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
