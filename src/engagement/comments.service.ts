import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../entities/comment.entity';
import { Post } from '../entities/post.entity';
import { User } from '../entities/user.entity';
import { ContractComment } from '../common/contract/types';
import { Paginated } from '../common/http/api-envelope';
import { decodeCursor, encodeCursor } from '../common/utils/cursor';
import { toPublicUser } from '../common/utils/user-sanitizer';
import { PostQueryService } from '../posts/post-query.service';
import { NotificationsService } from '../notifications/notifications.service';
import { displayName } from './post-likes.service';

const USER_FIELDS = {
  id: true,
  user_name: true,
  full_name: true,
  profile_picture: true,
} as const;

/** Comments on posts: oldest first; the author or the post owner may delete. */
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly comments: Repository<Comment>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly postQuery: PostQueryService,
    private readonly notifications: NotificationsService,
  ) {}

  private async activePost(postId: number) {
    const post = await this.posts.findOne({
      select: { id: true, user_id: true },
      where: { id: postId, is_active: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private present(
    c: Comment,
    postOwnerId: number,
    viewerId: number | null | undefined,
    baseUrl: string,
  ): ContractComment {
    return {
      id: String(c.id),
      text: c.comment,
      user: toPublicUser(c.user, baseUrl),
      createdAt: new Date(c.created_at).toISOString(),
      canDelete:
        !!viewerId && (c.user_id === viewerId || postOwnerId === viewerId),
    };
  }

  async list(
    postId: number,
    viewerId: number | null | undefined,
    cursor: string | undefined,
    limit: number,
    baseUrl: string,
  ): Promise<Paginated<ContractComment>> {
    const post = await this.activePost(postId);
    const state = decodeCursor<{ after: number }>(
      cursor,
      (c): c is { after: number } =>
        c && Number.isInteger(c.after) && c.after > 0,
    );
    const qb = this.comments
      .createQueryBuilder('c')
      .innerJoin('c.user', 'u')
      .addSelect(['u.id', 'u.user_name', 'u.full_name', 'u.profile_picture'])
      .where('c.post_id = :postId', { postId })
      .orderBy('c.id', 'ASC')
      .take(limit + 1);
    if (state) qb.andWhere('c.id > :after', { after: state.after });
    const rows = await qb.getMany();
    const page = rows.slice(0, limit);
    return {
      items: page.map((c) => this.present(c, post.user_id, viewerId, baseUrl)),
      nextCursor:
        rows.length > limit
          ? encodeCursor({ after: page[page.length - 1].id })
          : null,
    };
  }

  async create(
    postId: number,
    userId: number,
    text: string,
    baseUrl: string,
  ): Promise<ContractComment> {
    const post = await this.activePost(postId);
    const saved = await this.comments.save(
      this.comments.create({ post_id: postId, user_id: userId, comment: text }),
    );
    await this.postQuery.refreshCounts(postId);
    const author = await this.users.findOne({
      select: USER_FIELDS,
      where: { id: userId },
    });

    if (post.user_id !== userId) {
      await this.notifications.createNotification(
        post.user_id,
        'comment',
        `${displayName(author)} commented on your post`,
        { post_id: postId, comment_id: saved.id, actor_user_id: userId },
        userId,
      );
    }
    return this.present(
      { ...saved, user: author } as Comment,
      post.user_id,
      userId,
      baseUrl,
    );
  }

  async remove(
    commentId: number,
    userId: number,
  ): Promise<{ ok: true; commentsCount: number }> {
    const comment = await this.comments.findOne({
      select: { id: true, user_id: true, post_id: true },
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    const post = await this.posts.findOne({
      select: { id: true, user_id: true },
      where: { id: comment.post_id },
    });
    if (comment.user_id !== userId && post?.user_id !== userId) {
      throw new ForbiddenException(
        'Only the author or the post owner can delete this comment',
      );
    }
    await this.comments.delete({ id: commentId });
    const { commentsCount } = await this.postQuery.refreshCounts(
      comment.post_id,
    );
    return { ok: true, commentsCount };
  }
}
