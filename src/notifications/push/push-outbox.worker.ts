import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PushOutbox } from '../../entities/push-outbox.entity';
import { PushSender } from './push-sender.service';

export const PUSH_POLL_INTERVAL_MS = 2000;
export const PUSH_BATCH_SIZE = 100;
/** Retries after the first attempt, so at most 4 sends per job. */
export const PUSH_MAX_RETRIES = 3;
/** A 'sending' row older than this belonged to a worker that died. */
export const PUSH_STALE_LOCK_MS = 5 * 60_000;

/** Backoff before retry n (1-based): 5 s, 20 s, 80 s. */
export function retryDelayMs(attempts: number): number {
  return 5000 * 4 ** Math.max(0, attempts - 1);
}

/** TypeORM returns [rows, count] for UPDATE ... RETURNING on Postgres. */
function returnedRows(result: any): any[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0];
  }
  return Array.isArray(result) ? result : [];
}

/**
 * Background sender for push_outbox (WS7). Every 2 s it claims due rows with
 * SELECT ... FOR UPDATE SKIP LOCKED, so API instances never send the same
 * job twice, then sends them outside any transaction.
 * PUSH_WORKER_ENABLED=false turns the timer off (tests, one-off scripts).
 */
@Injectable()
export class PushOutboxWorker {
  private readonly logger = new Logger(PushOutboxWorker.name);
  private readonly enabled: boolean;
  private running = false;
  private lastRecover = 0;
  private lastPurge = 0;

  constructor(
    private readonly dataSource: DataSource,
    private readonly sender: PushSender,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('PUSH_WORKER_ENABLED') !== 'false';
  }

  @Interval('push-outbox', PUSH_POLL_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`push outbox run failed: ${error?.message}`);
    } finally {
      this.running = false;
    }
  }

  /** One pass: housekeeping, claim a batch, send it. Returns jobs handled. */
  async runOnce(limit = PUSH_BATCH_SIZE): Promise<number> {
    await this.housekeeping();
    const jobs = await this.claim(limit);
    for (const job of jobs) await this.process(job);
    return jobs.length;
  }

  /**
   * Atomically moves up to `limit` due rows to 'sending' and counts the
   * attempt. Rows locked by another worker are skipped, not waited for.
   */
  async claim(limit: number): Promise<PushOutbox[]> {
    const result = await this.dataSource.query(
      `UPDATE push_outbox o
          SET status = 'sending', attempts = o.attempts + 1, locked_at = now()
         FROM (SELECT id FROM push_outbox
                WHERE status = 'pending' AND next_attempt_at <= now()
                ORDER BY next_attempt_at, id
                LIMIT $1
                FOR UPDATE SKIP LOCKED) due
        WHERE o.id = due.id
        RETURNING o.*`,
      [limit],
    );
    return returnedRows(result)
      .map((r) => ({ ...r, id: Number(r.id), user_id: Number(r.user_id) }))
      .sort((a, b) => a.id - b.id);
  }

  async process(job: PushOutbox): Promise<void> {
    try {
      const outcome = await this.sender.send(job);
      await this.dataSource.query(
        `UPDATE push_outbox
            SET status = $2, sent_at = now(), locked_at = NULL, last_error = $3
          WHERE id = $1`,
        [job.id, outcome.status, outcome.detail ?? null],
      );
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 500);
      if (job.attempts > PUSH_MAX_RETRIES) {
        this.logger.warn(`push ${job.id} failed for good: ${message}`);
        await this.dataSource.query(
          `UPDATE push_outbox SET status = 'failed', locked_at = NULL, last_error = $2 WHERE id = $1`,
          [job.id, message],
        );
      } else {
        await this.dataSource.query(
          `UPDATE push_outbox
              SET status = 'pending', locked_at = NULL, last_error = $2,
                  next_attempt_at = now() + ($3::int * interval '1 millisecond')
            WHERE id = $1`,
          [job.id, message, retryDelayMs(job.attempts)],
        );
      }
    }
  }

  /**
   * Once a minute: put back rows a crashed worker left in 'sending'. Once an
   * hour: drop finished rows (sent/skipped after 7 days, failed after 30).
   */
  private async housekeeping(now = Date.now()): Promise<void> {
    if (now - this.lastRecover >= 60_000) {
      this.lastRecover = now;
      await this.dataSource.query(
        `UPDATE push_outbox
            SET status = CASE WHEN attempts > $2 THEN 'failed' ELSE 'pending' END,
                locked_at = NULL,
                last_error = COALESCE(last_error, 'worker lost the job')
          WHERE status = 'sending'
            AND locked_at < now() - ($1::int * interval '1 millisecond')`,
        [PUSH_STALE_LOCK_MS, PUSH_MAX_RETRIES],
      );
    }
    if (now - this.lastPurge >= 60 * 60_000) {
      this.lastPurge = now;
      await this.dataSource.query(
        `DELETE FROM push_outbox
          WHERE (status IN ('sent', 'skipped') AND created_at < now() - interval '7 days')
             OR (status = 'failed' AND created_at < now() - interval '30 days')`,
      );
    }
  }
}
