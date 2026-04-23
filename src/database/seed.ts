import { Category } from '../entities/category.entity';
import { Admin } from '../entities/admin.entity';
import { AppDataSource } from '../config/typeorm.config';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

// 12 Broad Category names with their corresponding image filenames from category-images folder
const categories = [
  { name: 'Italian', icon: 'italian.jpg' },
  { name: 'Asian', icon: 'chinese.jpeg' },
  { name: 'American', icon: 'american.jpg' },
  { name: 'Mexican/Latin', icon: 'mexican.jpg' },
  { name: 'Seafood', icon: 'seafood.jpg' },
  { name: 'Fast Food', icon: 'burgers.jpg' },
  { name: 'Desserts', icon: 'desserts.jpeg' },
  { name: 'Breakfast', icon: 'breakfast.jpg' },
  { name: 'Mediterranean', icon: 'pizza.jpg' },
  { name: 'Indian', icon: 'indian.jpg' },
  { name: 'Vegetarian/Vegan', icon: 'vegetarian.jpg' },
  { name: 'Steakhouses', icon: 'steakhouses.jpg' },
];

async function seedCategories() {
  const categoryRepository = AppDataSource.getRepository(Category);
  console.log('Seeding categories...');

  const categoryImagesPath = path.join(process.cwd(), 'category-images');
  const categoryStoragePath = path.join(process.cwd(), 'storage', 'category');

  // Ensure storage/category directory exists
  if (!fs.existsSync(categoryStoragePath)) {
    fs.mkdirSync(categoryStoragePath, { recursive: true });
  }

  let createdCount = 0;
  let updatedCount = 0;
  let skippedImages = 0;
  let copiedImages = 0;

  for (const categoryData of categories) {
    // Check if category already exists by name
    const existingCategory = await categoryRepository.findOne({
      where: { name: categoryData.name },
    });

    // Check if image file exists in category-images folder
    let iconFilename = null;
    if (categoryData.icon) {
      const sourceImagePath = path.join(categoryImagesPath, categoryData.icon);
      const destImagePath = path.join(categoryStoragePath, categoryData.icon);

      if (fs.existsSync(sourceImagePath)) {
        // Copy image to storage/category if it doesn't exist there
        if (!fs.existsSync(destImagePath)) {
          fs.copyFileSync(sourceImagePath, destImagePath);
          copiedImages++;
          console.log(
            `📋 Copied image: ${categoryData.icon} -> storage/category/`,
          );
        }
        iconFilename = categoryData.icon;
      } else {
        // Check if image already exists in storage/category
        if (fs.existsSync(destImagePath)) {
          iconFilename = categoryData.icon;
        } else {
          console.log(
            `⚠️  Image not found for ${categoryData.name}: ${categoryData.icon}`,
          );
          skippedImages++;
        }
      }
    }

    if (!existingCategory) {
      // Create the category
      const category = categoryRepository.create({
        name: categoryData.name,
        icon: iconFilename,
      });
      await categoryRepository.save(category);
      console.log(
        `✓ Created category: ${categoryData.name}${iconFilename ? ` (icon: ${iconFilename})` : ' (no icon)'}`,
      );
      createdCount++;
    } else {
      // Update existing category with icon
      existingCategory.icon = iconFilename;
      await categoryRepository.save(existingCategory);
      console.log(
        `✓ Updated category: ${categoryData.name}${iconFilename ? ` (icon: ${iconFilename})` : ' (no icon)'}`,
      );
      updatedCount++;
    }
  }

  console.log('\n✅ Categories seeding completed!');
  console.log(`   Created: ${createdCount} categories`);
  console.log(`   Updated: ${updatedCount} categories`);
  console.log(`   Images copied: ${copiedImages} images`);
  console.log(`   Images skipped: ${skippedImages} categories`);
  console.log(`   Total: ${categories.length} categories`);
}

async function seedAdmin() {
  const adminRepository = AppDataSource.getRepository(Admin);
  console.log('\nSeeding admin user...');

  const adminData = {
    email: 'admin@admin.com',
    password: 'admin1234',
  };

  // Check if admin already exists to prevent duplicates
  const existingAdmin = await adminRepository.findOne({
    where: { email: adminData.email },
  });

  if (existingAdmin) {
    console.log(`⚠️  Admin with email ${adminData.email} already exists`);
    console.log('   Skipping admin creation...');
    return;
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(adminData.password, 10);

  // Create admin user
  const admin = adminRepository.create({
    email: adminData.email,
    password: hashedPassword,
    is_active: true,
  });

  await adminRepository.save(admin);
  console.log(`✅ Admin user created successfully!`);
  console.log(`   Email: ${adminData.email}`);
  console.log(`   Password: ${adminData.password}`);
  console.log(`   ID: ${admin.id}`);
}

async function seedDatabase() {
  try {
    // Initialize database connection using the same config as migrations
    await AppDataSource.initialize();
    console.log('Database connection established\n');

    // Seed categories
    await seedCategories();

    // Seed admin user
    await seedAdmin();

    console.log('\n✅ Database seeding completed!\n');

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
