import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Post } from './post.entity';
import { Favorite } from './favorite.entity';

@Entity('restaurants')
@Index('idx_restaurants_google_place_id', ['google_place_id'])
export class Restaurant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  website: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  google_rating: number;

  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  app_rating: number;

  @Column({ nullable: true })
  google_place_id: string;

  @Column({ nullable: true })
  google_photo_reference: string;

  @Column('json', { nullable: true })
  google_photos: string[];

  @Column('json', { nullable: true })
  cuisines: string[];

  @Column({ nullable: true })
  price_level: string;

  @Column({ default: true })
  is_active: boolean;

  /**
   * Contract `OpeningHours` ({ periods, weekdayText }) copied from the last
   * Place Details response, so feeds and posts can show open/closed even
   * when the details cache has expired.
   */
  @Column({ type: 'jsonb', nullable: true })
  opening_periods: {
    periods: {
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }[];
    weekdayText: string[];
  } | null;

  /** Google utc_offset of the place, in minutes. */
  @Column({ type: 'int', nullable: true })
  utc_offset_minutes: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  hours_updated_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToMany(() => Post, (post) => post.restaurant)
  posts: Post[];

  @OneToMany(() => Favorite, (favorite) => favorite.restaurant)
  favorites: Favorite[];
}
