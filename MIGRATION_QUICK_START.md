# 🚀 Migration Quick Start - Urdu/Hindi Guide

## Simple Tareeqa - Migrations Use Karne Ka

### Development Mode (Recommended for Testing)

Abhi ke liye **migrations ko OFF** rakhen. Database automatically update hoga.

**Already configured hai!** Kuch nahi karna.

### Production Mode (Safe Database Updates)

Jab production pe deploy karenge, tab migrations use karenge.

---

## Commands Summary

### ✅ Development (Current)

```bash
# Start server - tables automatically create honge
npm run start:dev

# Categories seed karein
npm run seed
```

**Current Setting:**

- `USE_MIGRATIONS=false` in `.env`
- Tables automatically create hote hain
- Fast development

### 📦 Production (Future)

```bash
# Step 1: .env update karein
USE_MIGRATIONS=true
NODE_ENV=production

# Step 2: Migrations run karein
npm run migration:run

# Step 3: Seed karein
npm run seed

# Step 4: Server start karein
npm run start:prod
```

---

## Migration Commands

| Command                    | Kya Karta Hai                   |
| -------------------------- | ------------------------------- |
| `npm run migration:run`    | Database schema apply karta hai |
| `npm run migration:revert` | Last change undo karta hai      |
| `npm run migration:show`   | Status dikhata hai              |
| `npm run seed`             | Categories add karta hai        |

---

## Files Created ✅

### 1. Migration File

`src/migrations/1700000000001-InitialSchema.ts`

**Includes:**

- All 13 tables
- Foreign keys
- Indexes
- Constraints

### 2. TypeORM Config

`src/config/typeorm.config.ts`

**Purpose:**

- Migration configuration
- Database connection settings

### 3. Updated Database Config

`src/config/database.config.ts`

**Changes:**

- Migration support added
- Auto-sync for development
- Migration mode for production

---

## Usage Examples

### Example 1: Fresh Setup (Development)

```bash
# PostgreSQL start karein
brew services start postgresql

# Database create karein
createdb crunchy_db

# Backend start karein (tables auto-create)
cd /Users/mac/Documents/crunchyNew/backend_crunchyNew
npm run start:dev

# Seed categories
npm run seed
```

**Kya hoga:**

- ✅ Tables automatically create honge
- ✅ No migration commands needed
- ✅ Fast and easy

### Example 2: Production Deployment

```bash
# .env file mein change karein
USE_MIGRATIONS=true
NODE_ENV=production

# Migrations run karein
npm run migration:run

# Output:
# Migration InitialSchema1700000000001 has been executed successfully.

# Seed karein
npm run seed

# Server start karein
npm run start:prod
```

**Kya hoga:**

- ✅ Controlled schema updates
- ✅ Rollback possible
- ✅ Safe for production

---

## When to Use What?

### Use Auto-Sync (Current) When:

- ✅ Development mein ho
- ✅ Testing kar rahe ho
- ✅ Quick changes chahiye
- ✅ Local machine pe kaam ho

### Use Migrations When:

- ✅ Production deployment
- ✅ Team mein kaam ho
- ✅ Database changes track karne hon
- ✅ Rollback capability chahiye

---

## Quick Troubleshooting

### Migration Error Aya?

```bash
# Error dekhen
npm run migration:run

# Agar problem hai, revert karein
npm run migration:revert

# Ya database fresh start karein
dropdb crunchy_db
createdb crunchy_db
npm run migration:run
npm run seed
```

### Tables Duplicate Ho Gaye?

```bash
# Database reset karein
dropdb crunchy_db
createdb crunchy_db

# Fresh start
npm run start:dev
npm run seed
```

---

## Current Status ✅

**Implemented:**

- ✅ Complete initial migration
- ✅ All 13 tables schema
- ✅ Foreign keys & indexes
- ✅ Migration commands in package.json
- ✅ Development & production modes
- ✅ Rollback capability

**Configuration:**

- ✅ Development: Auto-sync enabled
- ✅ Production: Migration-ready
- ✅ Seed script: Working
- ✅ All commands: Ready

---

## Summary

### For Now (Development):

**Kuch nahi karna! Sab automatically ho raha hai.**

```bash
npm run start:dev
npm run seed
```

### For Later (Production):

**Jab deploy karni ho, tab migrations use karni hain.**

```bash
npm run migration:run
npm run seed
npm run start:prod
```

---

**Migration system complete hai! Ab development aur production dono ke liye ready hai!** 🎉

Detailed guide ke liye dekhen: `MIGRATIONS_GUIDE.md`
