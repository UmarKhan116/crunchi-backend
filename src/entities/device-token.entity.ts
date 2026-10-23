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

export type DevicePlatform = 'ios' | 'android';

/**
 * One row per FCM registration token. A user can have many devices; a token
 * belongs to exactly one user (it moves on a shared phone). Replaces
 * `users.device_token`, which is kept until old builds are retired.
 */
@Entity('device_tokens')
@Index('idx_device_tokens_user_id', ['user_id'])
@Index('uq_device_tokens_token', ['token'], { unique: true })
export class DeviceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;

  @Column({ type: 'text' })
  token: string;

  /** Null for tokens copied from users.device_token or sent by old builds. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  platform: DevicePlatform | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  app_version: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  last_seen_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
