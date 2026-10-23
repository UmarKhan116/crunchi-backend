import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { PublicUser } from '../common/contract/types';
import { toPublicUser } from '../common/utils/user-sanitizer';
import {
  resolveInsideStorage,
  STORAGE_ROOT,
} from '../common/utils/storage-path';
import { uploadOwnerPrefix } from '../media/media.service';
import { UpdateMeDto } from './dto/users.dto';

/** PATCH /api/me and DELETE /api/me. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  /** Overridable in tests. */
  storageRoot = STORAGE_ROOT;

  constructor(private readonly dataSource: DataSource) {}

  async update(
    userId: number,
    dto: UpdateMeDto,
    baseUrl: string,
  ): Promise<PublicUser & { bio: string | null }> {
    const set: Record<string, unknown> = {};
    if (dto.fullName !== undefined) set.full_name = dto.fullName;
    if (dto.bio !== undefined) set.bio = dto.bio || null;
    if (dto.avatarUrl !== undefined) {
      set.profile_picture = dto.avatarUrl
        ? this.avatarPath(dto.avatarUrl)
        : null;
    }

    const user = await this.dataSource.transaction(async (em) => {
      if (dto.userName !== undefined) {
        // No unique index on user_name (old data has duplicates), so
        // serialise changes per name and check case-insensitively.
        await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `username:${dto.userName.toLowerCase()}`,
        ]);
        const [taken] = await em.query(
          `SELECT 1 FROM users WHERE LOWER(user_name) = LOWER($1) AND id <> $2 LIMIT 1`,
          [dto.userName, userId],
        );
        if (taken) throw new ConflictException('That username is taken');
        set.user_name = dto.userName;
      }
      const columns = Object.keys(set);
      if (columns.length) {
        await em.query(
          `UPDATE users SET ${columns
            .map((c, i) => `"${c}" = $${i + 2}`)
            .join(', ')}, updated_at = now() WHERE id = $1`,
          [userId, ...columns.map((c) => set[c])],
        );
      }
      const [row] = await em.query(
        `SELECT id, user_name, full_name, profile_picture, bio FROM users WHERE id = $1`,
        [userId],
      );
      return row;
    });
    if (!user) throw new NotFoundException('User not found');
    return { ...toPublicUser(user, baseUrl), bio: user.bio || null };
  }

  /**
   * Accepts a URL or /storage/ path of a file under storage/ (what
   * imageupload returns) and stores it as "/storage/<name>".
   */
  private avatarPath(value: string): string {
    let resolved: string;
    try {
      let p = value.trim();
      if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
      if (!p.startsWith('/storage/') && p.includes('/')) throw new Error();
      resolved = resolveInsideStorage(this.storageRoot, p);
    } catch {
      throw new BadRequestException(
        'avatarUrl must be an image uploaded with /api/imageupload',
      );
    }
    if (
      !/\.(jpe?g|png|gif|webp)$/i.test(resolved) ||
      !fs.existsSync(resolved)
    ) {
      throw new BadRequestException(
        'avatarUrl must be an image uploaded with /api/imageupload',
      );
    }
    return `/storage/${path
      .relative(this.storageRoot, resolved)
      .split(path.sep)
      .join('/')}`;
  }

  /**
   * Deletes the account. Foreign keys cascade to posts, likes, comments,
   * favourites, follows, device tokens, queued pushes, settings, sessions
   * and notifications; notifications the user caused for others go too,
   * and the counters of posts they liked or commented are recounted. Their
   * uploads are removed from storage/ afterwards (never a file another
   * user's post or avatar still uses).
   */
  async remove(userId: number): Promise<void> {
    const [user] = await this.dataSource.query(
      `SELECT id, profile_picture FROM users WHERE id = $1`,
      [userId],
    );
    if (!user) throw new NotFoundException('User not found');

    const postImages: { name: string }[] = await this.dataSource.query(
      `SELECT DISTINCT jsonb_array_elements_text(images::jsonb) AS name
         FROM posts WHERE user_id = $1 AND images IS NOT NULL
          AND json_typeof(images) = 'array'`,
      [userId],
    );

    await this.dataSource.transaction(async (em) => {
      const touched: { post_id: number }[] = await em.query(
        `SELECT post_id FROM likes WHERE user_id = $1
         UNION SELECT post_id FROM comments WHERE user_id = $1`,
        [userId],
      );
      await em.query(`DELETE FROM notifications WHERE actor_user_id = $1`, [
        userId,
      ]);
      await em.query(`DELETE FROM users WHERE id = $1`, [userId]);
      const ids = touched.map((t) => t.post_id);
      if (ids.length) {
        await em.query(
          `UPDATE posts p
              SET likes_count = (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id),
                  comments_count = (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)
            WHERE p.id = ANY($1::int[])`,
          [ids],
        );
      }
    });

    await this.removeFiles(
      userId,
      postImages.map((r) => r.name),
      user.profile_picture,
    ).catch((error) =>
      this.logger.warn(
        `files of user ${userId} not removed: ${error?.message}`,
      ),
    );
  }

  private async removeFiles(
    userId: number,
    postImages: string[],
    avatar: string | null,
  ) {
    const root = this.storageRoot;
    const candidates = new Set<string>();
    const add = (name: string) => {
      try {
        const file = resolveInsideStorage(root, name);
        candidates.add(path.relative(root, file));
      } catch {
        // not a storage file (URL elsewhere, traversal): leave it alone
      }
    };

    // Uploads named after the owner, whether or not a post used them.
    if (fs.existsSync(root)) {
      for (const name of fs.readdirSync(root)) {
        if (name.startsWith(uploadOwnerPrefix(userId))) add(name);
      }
    }
    // Older uploads have no owner in the name: those used by their posts.
    for (const name of postImages) {
      if (typeof name === 'string' && !/^https?:/i.test(name)) add(name);
    }
    // Avatar: legacy update_profile stores a bare name under storage/user.
    if (avatar && !/^https?:/i.test(avatar)) {
      add(
        avatar.startsWith('/storage/') || avatar.includes('/')
          ? avatar
          : `user/${avatar}`,
      );
    }
    for (const rel of candidates) {
      const name = rel.split(path.sep).join('/');
      const [usedByPost] = await this.dataSource.query(
        `SELECT 1 FROM posts WHERE json_typeof(images) = 'array'
            AND (images::jsonb @> jsonb_build_array($1::text)
              OR images::jsonb @> jsonb_build_array('/storage/' || $1::text))
          LIMIT 1`,
        [name],
      );
      const [usedByAvatar] = await this.dataSource.query(
        `SELECT 1 FROM users
          WHERE profile_picture::text IN ($1::text, '/storage/' || $1::text,
                                          regexp_replace($1::text, '^user/', ''))
          LIMIT 1`,
        [name],
      );
      if (usedByPost || usedByAvatar) continue;
      const file = path.join(root, rel);
      if (fs.existsSync(file) && fs.statSync(file).isFile())
        fs.unlinkSync(file);
    }
  }
}
