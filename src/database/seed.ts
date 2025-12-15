import { Category } from '../entities/category.entity';
import { Admin } from '../entities/admin.entity';
import { AppDataSource } from '../config/typeorm.config';
import * as bcrypt from 'bcryptjs';

const categories = [
  'Pizza',
  'Breakfast',
  'Burgers',
  'Chinese',
  'Mexican',
  'Korean',
  'Steakhouses',
  'Thai',
  'Seafood',
  'Japanese',
  'Italian',
  'Vietnamese',
  'Sandwiches',
  'Vegetarian',
  'Sushi Bars',
  'American',
  'Indian',
  'South Indian',
  'Dumplings',
  'Noodles',
  'Pasta',
  'Beef',
  'Pork',
  'Afghani',
  'Chowmein',
  'Ramen',
  'Salad',
  'Steak',
  'Shrimp',
  'Tuna',
  'Fish',
  'Spaghetti',
  'Pie',
  'Cakes',
  'Desserts',
  'Coffee',
  'Tea',
];

async function seedCategories() {
  const categoryRepository = AppDataSource.getRepository(Category);
  console.log('Seeding categories...');

  let createdCount = 0;
  let existingCount = 0;

  for (const categoryName of categories) {
    // Check if category already exists to prevent duplicates
    const existingCategory = await categoryRepository.findOne({
      where: { name: categoryName },
    });

    if (!existingCategory) {
      const category = categoryRepository.create({
        name: categoryName,
        icon: null,
      });
      await categoryRepository.save(category);
      console.log(`✓ Created category: ${categoryName}`);
      createdCount++;
    } else {
      console.log(`- Category already exists: ${categoryName}`);
      existingCount++;
    }
  }

  console.log('\n✅ Categories seeding completed!');
  console.log(`   Created: ${createdCount} categories`);
  console.log(`   Already existed: ${existingCount} categories`);
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
