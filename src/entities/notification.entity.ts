import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notifications')
@Index('idx_notifications_user_id', ['user_id'])
@Index('idx_notifications_actor_user_id', ['actor_user_id'])
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @Column('text')
  message: string;

  @Column('json', { nullable: true })
  data: any;

  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;

  @Column({ nullable: true })
  actor_user_id: number; // User who performed the action (liked, commented, followed)
}
