import {
  androidChannelFor,
  buildFcmMessage,
  linkFor,
  toFcmData,
} from './push-message';

describe('push message', () => {
  it('stringifies data and drops empty keys', () => {
    expect(
      toFcmData({
        type: 'like',
        notificationId: 123,
        postId: 45,
        placeId: null,
        userId: undefined,
        flag: true,
        nested: { a: 1 },
      }),
    ).toEqual({
      type: 'like',
      notificationId: '123',
      postId: '45',
      flag: 'true',
      nested: '{"a":1}',
    });
  });

  it('builds links to posts, places and profiles', () => {
    expect(linkFor('like', { postId: 45, userId: 7 })).toBe('/p/45');
    expect(linkFor('comment', { postId: '45' })).toBe('/p/45');
    expect(linkFor('follow', { userId: 7, postId: null })).toBe('/u/7');
    expect(linkFor('broadcast', { placeId: 'ChIJ a/b' })).toBe(
      '/r/ChIJ%20a%2Fb',
    );
    expect(linkFor('broadcast', {})).toBeNull();
  });

  it('picks the Android channel by type', () => {
    expect(androidChannelFor('like')).toBe('activity');
    expect(androidChannelFor('follow')).toBe('activity');
    expect(androidChannelFor('broadcast')).toBe('promotions');
  });

  it('sets the APNs badge and never a negative one', () => {
    const msg = buildFcmMessage(
      'like',
      { title: '', body: 'hi', data: { type: 'like' } },
      -1,
    );
    expect(msg.notification).toEqual({ title: 'Crunchii', body: 'hi' });
    expect(msg.apns.payload.aps.badge).toBe(0);
    expect(msg.android.priority).toBe('high');
  });
});
