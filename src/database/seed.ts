import { Category } from '../entities/category.entity';
import { AppDataSource } from '../config/typeorm.config';

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

async function seedDatabase() {
  try {
    // Initialize database connection using the same config as migrations
    await AppDataSource.initialize();
    console.log('Database connection established');

    const categoryRepository = AppDataSource.getRepository(Category);
    console.log('Seeding categories...');

    let createdCount = 0;
    let existingCount = 0;

    for (const categoryName of categories) {
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

    console.log('\n✅ Database seeding completed!');
    console.log(`   Created: ${createdCount} categories`);
    console.log(`   Already existed: ${existingCount} categories`);
    console.log(`   Total: ${categories.length} categories\n`);

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
