import { Restaurant } from '../entities/restaurant.entity';
import { AppDataSource } from '../config/typeorm.config';

const dummyRestaurants = [
  {
    name: 'Crunchy Bites Restaurant',
    description:
      'Best burgers and pizzas in town! A family-friendly restaurant with amazing food and great ambiance.',
    address: '123 Main Street, New York, NY 10001',
    latitude: 40.758,
    longitude: -73.9855,
    phone: '+1 (555) 123-4567',
    website: 'https://crunchybites.example.com',
    google_rating: 4.5,
    app_rating: 4.7,
    google_place_id: 'DUMMY_PLACE_001',
    google_photo_reference: null,
    google_photos: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
    ],
    cuisines: ['American', 'Burgers', 'Pizza', 'Italian'],
    price_level: '$$',
    is_active: true,
  },
  {
    name: 'Spicy Paradise',
    description:
      'Authentic Indian and Pakistani cuisine with traditional flavors.',
    address: '456 Curry Lane, Manhattan, NY 10002',
    latitude: 40.7128,
    longitude: -74.006,
    phone: '+1 (555) 987-6543',
    website: 'https://spicyparadise.example.com',
    google_rating: 4.8,
    app_rating: 4.9,
    google_place_id: 'DUMMY_PLACE_002',
    google_photo_reference: null,
    google_photos: [
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800',
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800',
    ],
    cuisines: ['Indian', 'Pakistani', 'Asian'],
    price_level: '$$$',
    is_active: true,
  },
  {
    name: 'Sushi Master',
    description: 'Fresh sushi and Japanese delicacies made by expert chefs.',
    address: '789 Tokyo Street, Brooklyn, NY 11201',
    latitude: 40.6782,
    longitude: -73.9442,
    phone: '+1 (555) 456-7890',
    website: 'https://sushimaster.example.com',
    google_rating: 4.6,
    app_rating: 4.5,
    google_place_id: 'DUMMY_PLACE_003',
    google_photo_reference: null,
    google_photos: [
      'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=800',
      'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800',
    ],
    cuisines: ['Japanese', 'Sushi', 'Asian'],
    price_level: '$$$$',
    is_active: true,
  },
];

async function seedRestaurants() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connection established');

    const restaurantRepository = AppDataSource.getRepository(Restaurant);
    console.log('Seeding restaurants...\n');

    let createdCount = 0;
    let existingCount = 0;

    for (const restaurantData of dummyRestaurants) {
      const existingRestaurant = await restaurantRepository.findOne({
        where: { google_place_id: restaurantData.google_place_id },
      });

      if (!existingRestaurant) {
        const restaurant = restaurantRepository.create(restaurantData);
        await restaurantRepository.save(restaurant);
        console.log(`✓ Created restaurant: ${restaurantData.name}`);
        console.log(`  Address: ${restaurantData.address}`);
        console.log(`  Rating: ${restaurantData.google_rating}`);
        console.log(`  Cuisines: ${restaurantData.cuisines.join(', ')}\n`);
        createdCount++;
      } else {
        console.log(`- Restaurant already exists: ${restaurantData.name}\n`);
        existingCount++;
      }
    }

    console.log('✅ Restaurant seeding completed!');
    console.log(`   Created: ${createdCount} restaurants`);
    console.log(`   Already existed: ${existingCount} restaurants`);
    console.log(`   Total: ${dummyRestaurants.length} restaurants\n`);

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during restaurant seeding:', error);
    process.exit(1);
  }
}

// Run the seed function
seedRestaurants();
