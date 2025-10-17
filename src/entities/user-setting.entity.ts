import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_settings')
export class UserSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: true })
  notifications_enabled: boolean;

  @Column({ default: true })
  location_sharing: boolean;

  @Column({ default: true })
  profile_visibility: boolean;

  @Column({ default: 'en' })
  language: string;

  @Column({ default: 'km' })
  distance_unit: string;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 10.0 })
  search_radius: number;

  @Column('json', { nullable: true })
  favorite_categories: number[];

  @Column('json', { nullable: true })
  dietary_preferences: string[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ unique: true })
  user_id: number;
}
