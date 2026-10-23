import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../entities/post.entity';
import { User } from '../entities/user.entity';
import { PostQueryService } from '../posts/post-query.service';
import { NotificationsService } from '../notifications/notifications.service';
import { returnedRows } from '../common/utils/sql';

/** Name used in notification messages ("Bob liked your post"). */
export function displayName(user?: Partial<User> | null): string {
  return user?.full_name || user?.user_name || 'Someone';
}

/**
 * PUT /api/posts/:postId/like. Sets the state instead of toggling, so an
 * offline replay can never undo the user's action.
 */
@Injectable()
export class PostLikesService {
  constructor(
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly postQuery: PostQueryService,
    private readonly notifications: NotificationsService,
  ) {}

  async setLiked(
    userId: number,
    postId: number,
    liked: boolean,
  ): Promise<{ liked: boolean; likesCount: number }> {
    const post = await this.posts.findOne({
      select: { id: true, user_id: true },
      where: { id: postId, is_active: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    // The (user_id, post_id) unique constraint makes both statements
    // no-ops when the state is already what was asked for.
    const changed = liked
      ? returnedRows(
          await this.posts.query(
            `INSERT INTO likes (user_id, post_id) VALUES ($1, $2)
             ON CONFLICT (user_id, post_id) DO NOTHING
             RETURNING id`,
            [userId, postId],
          ),
        ).length > 0
      : returnedRows(
          await this.posts.query(
            `DELETE FROM likes WHERE user_id = $1 AND post_id = $2 RETURNING id`,
            [userId, postId],
          ),
        ).length > 0;

    const { likesCount } = changed
      ? await this.postQuery.refreshCounts(postId)
      : {
          likesCount:
            (
              await this.posts.findOne({
                select: { id: true, likes_count: true },
                where: { id: postId },
              })
            )?.likes_count ?? 0,
        };

    // Push only on a false → true change, never to yourself.
    if (liked && changed && post.user_id !== userId) {
      const liker = await this.users.findOne({
        select: { id: true, full_name: true, user_name: true },
        where: { id: userId },
      });
      await this.notifications.createNotification(
        post.user_id,
        'like',
        `${displayName(liker)} liked your post`,
        { post_id: post.id, actor_user_id: userId },
        userId,
      );
    }
    return { liked, likesCount };
  }
}
