import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractPost } from '../common/contract/types';
import { PostQueryService } from '../posts/post-query.service';
import {
  POST_PRESENTER_RELATIONS,
  PostPresenter,
} from '../posts/post-presenter.service';
import { PlacesService } from '../places/places.service';
import { Post } from '../entities/post.entity';

/** GET /api/posts/:postId (deep links and push taps) and the share page. */
@Injectable()
export class PostReadService {
  constructor(
    private readonly postQuery: PostQueryService,
    private readonly presenter: PostPresenter,
    private readonly places: PlacesService,
  ) {}

  /** The active post with its relations, or null. */
  async load(postId: number): Promise<Post | null> {
    const [post] = await this.postQuery.loadInOrder(
      [postId],
      POST_PRESENTER_RELATIONS,
    );
    return post?.is_active && post.user ? post : null;
  }

  async getPost(
    postId: number,
    viewerId: number | null | undefined,
    baseUrl: string,
  ): Promise<ContractPost> {
    const post = await this.load(postId);
    if (!post) throw new NotFoundException('Post not found');
    const placeId = post.restaurant?.google_place_id;
    const [item] = await this.presenter.present([post], {
      baseUrl,
      userId: viewerId,
      // Fresher place data from the details cache (never calls Google).
      placeById: placeId
        ? await this.places.cachedPostPlaces([placeId], baseUrl)
        : undefined,
    });
    return item;
  }
}
