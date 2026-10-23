import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Comment } from './comment.entity';
import { Like } from './like.entity';
import { Category } from './category.entity';
import { Restaurant } from './restaurant.entity';

// Indexes and ON DELETE CASCADE are declared here so `migration:generate`
// keeps them (1777064415555 dropped them because the entities did not).
@Entity('posts')
@Index('idx_posts_user_id', ['user_id'])
@Index('idx_posts_category_id', ['category_id'])
@Index('idx_posts_restaurant_id', ['restaurant_id'])
@Index('idx_posts_created_at', ['created_at'])
// Bounding-box prefilter for the distance queries (index-distance, /feed).
@Index('idx_posts_lat_lng', ['latitude', 'longitude'])
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  description: string;

  @Column('json', { nullable: true })
  images: string[];

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  rating: number;

  @Column({ default: 0 })
  likes_count: number;

  @Column({ default: 0 })
  comments_count: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;

  @ManyToOne(() => Category, (category) => category.posts)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column()
  category_id: number;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.posts, {
    nullable: true,
  })
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  @Column({ nullable: true })
  restaurant_id: number;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];

  @OneToMany(() => Like, (like) => like.post)
  likes: Like[];
}
