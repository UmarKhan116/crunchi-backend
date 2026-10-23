import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicePlatform, DeviceToken } from '../entities/device-token.entity';

/** Push tokens, one row per device (see DeviceToken). */
@Injectable()
export class DeviceTokensService {
  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokens: Repository<DeviceToken>,
  ) {}

  /**
   * Upsert. A token already owned by another user (shared phone, account
   * switch) moves to `userId`, so pushes for the old account stop.
   */
  async register(
    userId: number,
    token: string,
    platform?: DevicePlatform | null,
    appVersion?: string | null,
  ): Promise<void> {
    const value = token?.trim();
    if (!value) return;
    await this.tokens.query(
      `INSERT INTO device_tokens (user_id, token, platform, app_version, last_seen_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (token) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              platform = COALESCE(EXCLUDED.platform, device_tokens.platform),
              app_version = COALESCE(EXCLUDED.app_version, device_tokens.app_version),
              last_seen_at = now()`,
      [userId, value, platform ?? null, appVersion ?? null],
    );
    // Old code paths still read users.device_token; don't leave the moved
    // token on the previous owner.
    await this.tokens.query(
      `UPDATE users SET device_token = NULL WHERE device_token = $2 AND id <> $1`,
      [userId, value],
    );
  }

  /** Logout: removes the caller's token only. Idempotent. */
  async remove(userId: number, token: string): Promise<void> {
    await this.tokens.query(
      `DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`,
      [userId, token],
    );
    await this.tokens.query(
      `UPDATE users SET device_token = NULL WHERE id = $1 AND device_token = $2`,
      [userId, token],
    );
  }

  async tokensFor(userId: number): Promise<string[]> {
    const rows = await this.tokens.find({
      select: { token: true },
      where: { user_id: userId },
      order: { last_seen_at: 'DESC' },
    });
    return rows.map((r) => r.token);
  }

  /** Tokens FCM reported as unregistered/invalid. */
  async removeDeadTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await this.tokens.query(
      `DELETE FROM device_tokens WHERE token = ANY($1::text[])`,
      [tokens],
    );
    await this.tokens.query(
      `UPDATE users SET device_token = NULL WHERE device_token = ANY($1::text[])`,
      [tokens],
    );
  }
}
