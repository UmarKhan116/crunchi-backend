import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('sessions')
@Index('idx_sessions_user_id', ['user_id'])
export class Session {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  session_id: string;

  @Column({ nullable: true })
  device_type: string;

  @Column({ nullable: true })
  device_token: string;

  @Column({ nullable: true })
  ip_address: string;

  @Column({ nullable: true })
  user_agent: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  last_activity: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;
}
