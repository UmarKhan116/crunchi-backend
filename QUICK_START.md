# 🚀 Backend Quick Start Guide

Yeh guide Urdu/Hindi mein hai taki aapko asaan lage!

## ✅ Step 1: Database Setup

### PostgreSQL Install Karein (agar nahi hai)

```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Ya phir Postgres.app use karein: https://postgresapp.com/
```

### Database Create Karein

```bash
# PostgreSQL mein login karein
psql postgres

# Database create karein
CREATE DATABASE crunchy_db;

# Check karein
\l

# Exit
\q
```

## ✅ Step 2: Environment Variables

`.env` file pehle se bani hui hai. **Sirf password update karein:**

```bash
# .env file open karein
nano .env

# Ya VS Code se open karein
code .env
```

**Important: `DB_PASSWORD` apne postgres password se change karein!**

```env
DB_PASSWORD=your-actual-postgres-password
```

Save karein aur close karein.

## ✅ Step 3: Backend Start Karein

```bash
# Backend folder mein jaein
cd /Users/mac/Documents/crunchyNew/backend_crunchyNew

# Dependencies install karein (agar pehle nahi kiya)
npm install

# Backend start karein
npm run start:dev
```

**Success Signs:**

- ✅ "Application is running on: http://localhost:3000"
- ✅ "Swagger documentation: http://localhost:3000/api/docs"
- ✅ No database errors

## ✅ Step 4: Seed Database (Categories Add Karein)

Naye terminal window mein:

```bash
cd /Users/mac/Documents/crunchyNew/backend_crunchyNew
npm run seed
```

## ✅ Step 5: Mobile App Ko Backend Se Connect Karein

### Find your local IP:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Example output:** `inet 192.168.1.10` ← Yeh aapka IP hai

### Mobile App Mein BASE_URL Update Karein

File: `CrunchyAppNew/src/Constants/Endpoints.js`

```javascript
// Local testing ke liye
export const BaseURL = 'http://192.168.1.10:3000'; // ← Apna IP yahan lagaein

// Ya phir agar emulator use kar rahe ho:
export const BaseURL = 'http://localhost:3000'; // Android emulator
export const BaseURL = 'http://127.0.0.1:3000'; // iOS simulator
```

## ✅ Step 6: Mobile App Run Karein

### Android:

```bash
cd /Users/mac/Documents/crunchyNew/CrunchyAppNew
npm start
# Naye terminal mein:
npm run android
```

### iOS:

```bash
cd /Users/mac/Documents/crunchyNew/CrunchyAppNew
npm start
# Naye terminal mein:
npm run ios
```

## 🐛 Common Issues & Solutions

### Issue 1: Database Connection Failed

```bash
Error: password authentication failed for user "postgres"
```

**Solution:** `.env` file mein `DB_PASSWORD` correct karein

### Issue 2: Database Not Found

```bash
Error: database "crunchy_db" does not exist
```

**Solution:**

```bash
psql postgres
CREATE DATABASE crunchy_db;
\q
```

### Issue 3: Port Already in Use

```bash
Error: Port 3000 is already in use
```

**Solution:**

```bash
# Port 3000 ko free karein
lsof -ti:3000 | xargs kill -9

# Ya phir .env mein PORT change karein
PORT=3001
```

### Issue 4: Cannot Connect from Mobile App

**Solution:**

1. Backend aur mobile same network par hon (same WiFi)
2. Backend IP address correct ho mobile app mein
3. Firewall backend port ko block na kar raha ho

```bash
# Check karein backend chal raha hai:
curl http://localhost:3000
```

### Issue 5: File Upload Not Working

**Solution:**

```bash
# Storage directories create karein
cd /Users/mac/Documents/crunchyNew/backend_crunchyNew
mkdir -p storage/User storage/uploads storage/video
chmod 755 storage
```

## 📱 Testing Checklist

Backend chal raha hai? Ab test karein:

- [ ] **Swagger Docs:** http://localhost:3000/api/docs
- [ ] **Sign Up:** Mobile app se naya user banao
- [ ] **Login:** Login test karo
- [ ] **Profile:** Profile image upload karo
- [ ] **Categories:** Categories list dekho
- [ ] **Post Create:** Naya post banao with image
- [ ] **Post List:** Posts dikhni chahiye
- [ ] **Like:** Post ko like karo
- [ ] **Comment:** Comment karo
- [ ] **Follow:** Kisi user ko follow karo
- [ ] **Search:** Users search karo
- [ ] **Favorites:** Restaurant favorite karo
- [ ] **Settings:** App settings save karo

## 🎉 Success!

Agar sab kuch chal gaya, to congratulations! Aapka full-stack app ready hai!

## 📚 Additional Documentation

- **API Docs:** `API_IMPLEMENTATION_SUMMARY.md`
- **Testing Guide:** `TESTING_GUIDE.md`
- **Migrations:** `MIGRATIONS_GUIDE.md`
- **Setup Details:** `SETUP_README.md`

---

**Need Help?** Check the error messages carefully and follow the solutions above!
