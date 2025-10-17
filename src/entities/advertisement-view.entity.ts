import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Advertisement } from './advertisement.entity';
import { User } from './user.entity';

@Entity('advertisement_views')
@Unique(['advertisement_id', 'user_id'])
export class AdvertisementView {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 0 })
  view_count: number;

  @Column({ default: 0 })
  click_count: number;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => Advertisement, (advertisement) => advertisement.views)
  @JoinColumn({ name: 'advertisement_id' })
  advertisement: Advertisement;

  @Column()
  advertisement_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;
}
