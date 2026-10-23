import { EntityManager } from 'typeorm';
import { PushType } from '../../entities/push-outbox.entity';

export { PushType };

/** A push for one user. `data` values are stringified by the producer. */
export interface PushJob {
  userId: number;
  type: PushType;
  /** Defaults to "Crunchii". */
  title?: string;
  body: string;
  /**
   * Contract fields (notificationId, postId, userId, placeId, link) plus any
   * legacy keys old builds read (post_id, actor_user_id, ...).
   */
  data?: Record<string, unknown>;
}

/**
 * How features ask for a push. Today it writes push_outbox rows; Milestone 3's
 * admin broadcast enqueues `type: 'broadcast'` jobs through the same
 * interface (one per recipient). Pass `manager` to enqueue inside the
 * caller's transaction. Users with notifications turned off are skipped.
 * Resolves with the number of jobs queued.
 */
export interface PushProducer {
  enqueue(jobs: PushJob | PushJob[], manager?: EntityManager): Promise<number>;
}

export const PUSH_PRODUCER = Symbol('PUSH_PRODUCER');
