import { NotFoundException } from '@nestjs/common';
import { PostLikesService } from './post-likes.service';

describe('PostLikesService.setLiked (idempotent)', () => {
  let likes: Set<string>;
  let posts: any;
  let users: any;
  let postQuery: any;
  let notifications: any;
  let service: PostLikesService;

  const OWNER = 1;
  const LIKER = 2;

  beforeEach(() => {
    likes = new Set();
    posts = {
      findOne: jest.fn(async ({ where }) =>
        where.id === 10
          ? { id: 10, user_id: OWNER, likes_count: likes.size }
          : null,
      ),
      // A tiny model of the likes table with its unique constraint.
      query: jest.fn(async (sql: string, [userId, postId]: number[]) => {
        const key = `${userId}:${postId}`;
        if (sql.startsWith('INSERT')) {
          if (likes.has(key)) return [];
          likes.add(key);
          return [{ id: likes.size }];
        }
        if (sql.startsWith('DELETE')) {
          const had = likes.delete(key);
          return [had ? [{ id: 1 }] : [], had ? 1 : 0];
        }
        throw new Error(`unexpected SQL ${sql}`);
      }),
    };
    users = {
      findOne: jest.fn(async () => ({ id: LIKER, full_name: 'Bob' })),
    };
    postQuery = {
      refreshCounts: jest.fn(async () => ({
        likesCount: likes.size,
        commentsCount: 0,
      })),
    };
    notifications = { createNotification: jest.fn(async () => ({})) };
    service = new PostLikesService(posts, users, postQuery, notifications);
  });

  it('likes once, notifies the owner once, and a replay is a no-op', async () => {
    expect(await service.setLiked(LIKER, 10, true)).toEqual({
      liked: true,
      likesCount: 1,
    });
    expect(await service.setLiked(LIKER, 10, true)).toEqual({
      liked: true,
      likesCount: 1,
    });
    expect(likes.size).toBe(1);
    expect(postQuery.refreshCounts).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      OWNER,
      'like',
      'Bob liked your post',
      { post_id: 10, actor_user_id: LIKER },
      LIKER,
    );
  });

  it('unlikes idempotently and never pushes on true → false', async () => {
    await service.setLiked(LIKER, 10, true);
    notifications.createNotification.mockClear();
    expect(await service.setLiked(LIKER, 10, false)).toEqual({
      liked: false,
      likesCount: 0,
    });
    expect(await service.setLiked(LIKER, 10, false)).toEqual({
      liked: false,
      likesCount: 0,
    });
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('a like → unlike → like sequence pushes again only on the new false → true', async () => {
    await service.setLiked(LIKER, 10, true);
    await service.setLiked(LIKER, 10, false);
    await service.setLiked(LIKER, 10, true);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
  });

  it('never notifies you about your own like', async () => {
    await service.setLiked(OWNER, 10, true);
    expect(likes.size).toBe(1);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('404s for a missing or hidden post', async () => {
    await expect(service.setLiked(LIKER, 99, true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
