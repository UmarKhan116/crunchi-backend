import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AdvertisementView } from './advertisement-view.entity';

@Entity('advertisements')
export class Advertisement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  image_url: string;

  /**
   * File extension for the advertisement media.
   * Used by the mobile app to distinguish between image and video ads.
   * Example values: "jpg", "png", "mp4"
   */
  @Column({ nullable: true })
  type: string;

  /**
   * Raw file name of the advertisement media without any path.
   * Example: "ad-banner-1.jpg" or "promo-video-1.mp4"
   *
   * The mobile app constructs the full URL as:
   *   ADVERTISEMENTS_BASE_URL + file_name
   */
  @Column({ nullable: true })
  file_name: string;

  @Column({ nullable: true })
  link_url: string;

  @Column({ default: 0 })
  views_count: number;

  @Column({ default: 0 })
  clicks_count: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  target_audience: string;

  @Column({ nullable: true })
  budget: number;

  @Column({ nullable: true })
  start_date: Date;

  @Column({ nullable: true })
  end_date: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToMany(() => AdvertisementView, (view) => view.advertisement)
  views: AdvertisementView[];
}
