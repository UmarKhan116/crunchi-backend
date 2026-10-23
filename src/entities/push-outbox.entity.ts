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

export type PushType = 'like' | 'comment' | 'follow' | 'broadcast';

export type PushOutboxStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'skipped'
  | 'failed';

/** What a producer stores; the worker adds the badge and channel at send time. */
export interface PushPayload {
  title: string;
  body: string;
  /** FCM data, already strings (see push-message.ts). */
  data: Record<string, string>;
}

/**
 * Push jobs waiting to be sent (no Redis: the table is the queue). Written in
 * the same transaction as the notification; PushOutboxWorker claims rows with
 * FOR UPDATE SKIP LOCKED, so several API instances can run the worker.
 */
@Entity('push_outbox')
@Index('idx_push_outbox_status_next_attempt', ['status', 'next_attempt_at'])
@Index('idx_push_outbox_user_id', ['user_id'])
export class PushOutbox {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;

  @Column({ type: 'varchar', length: 32 })
  type: PushType;

  @Column({ type: 'jsonb' })
  payload: PushPayload;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: PushOutboxStatus;

  /** Sends tried so far (incremented when a worker claims the row). */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  next_attempt_at: Date;

  /** When a worker claimed it; stale 'sending' rows are put back. */
  @Column({ type: 'timestamptz', nullable: true })
  locked_at: Date | null;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sent_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
