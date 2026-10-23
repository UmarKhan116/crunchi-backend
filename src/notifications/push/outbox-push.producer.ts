import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PushOutbox } from '../../entities/push-outbox.entity';
import { DEFAULT_PUSH_TITLE, toFcmData } from './push-message';
import { PushJob, PushProducer } from './push.types';

/** PushProducer backed by the push_outbox table (no Redis). */
@Injectable()
export class OutboxPushProducer implements PushProducer {
  constructor(private readonly dataSource: DataSource) {}

  async enqueue(
    jobs: PushJob | PushJob[],
    manager?: EntityManager,
  ): Promise<number> {
    const list = (Array.isArray(jobs) ? jobs : [jobs]).filter(
      (j) => Number.isInteger(j?.userId) && j.userId > 0,
    );
    if (!list.length) return 0;
    const em = manager ?? this.dataSource.manager;

    // Contract: never push to users who turned notifications off. No
    // settings row means the default (on).
    const userIds = [...new Set(list.map((j) => j.userId))];
    const off: { user_id: number }[] = await em.query(
      `SELECT user_id FROM user_settings
        WHERE user_id = ANY($1::int[]) AND notifications_enabled = false`,
      [userIds],
    );
    const muted = new Set(off.map((r) => Number(r.user_id)));
    const rows = list
      .filter((j) => !muted.has(j.userId))
      .map((j) => ({
        user_id: j.userId,
        type: j.type,
        payload: {
          title: j.title || DEFAULT_PUSH_TITLE,
          body: j.body,
          data: toFcmData({ ...(j.data ?? {}), type: j.type }),
        },
      }));
    if (!rows.length) return 0;
    await em.insert(PushOutbox, rows);
    return rows.length;
  }
}
