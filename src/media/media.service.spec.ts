import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MediaService } from './media.service';
import { resolveInsideStorage } from '../common/utils/storage-path';

describe('MediaService.removeImage', () => {
  let root: string;
  let outside: string;
  let service: MediaService;
  const postRepository = { query: jest.fn() };

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'be-m1-media-'));
    root = path.join(base, 'storage');
    fs.mkdirSync(path.join(root, 'user'), { recursive: true });
    outside = path.join(base, 'secret.txt');
    fs.writeFileSync(outside, 'do not delete');
    postRepository.query.mockReset().mockResolvedValue([]);
    service = new MediaService(postRepository as any, {} as any);
    (service as any).storageRoot = root;
  });

  const touch = (name: string) => {
    fs.writeFileSync(path.join(root, name), 'x');
    return path.join(root, name);
  };

  it.each([
    '../secret.txt',
    '../../etc/passwd',
    'user/../../secret.txt',
    '/etc/passwd',
    '%2e%2e%2fsecret.txt',
    '/storage/../secret.txt',
    'http://evil.example/storage/../secret.txt',
    'image-u1-1.jpg\0.png',
    '..',
    '',
  ])('rejects %j with 400 and deletes nothing', async (name) => {
    await expect(service.removeImage(1, name)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fs.existsSync(outside)).toBe(true);
    expect(postRepository.query).not.toHaveBeenCalled();
  });

  it('removes your own new-style upload', async () => {
    const file = touch('image-u7-1700000000000-1.jpg');
    const res = await service.removeImage(7, 'image-u7-1700000000000-1.jpg');
    expect(res.success).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('accepts the /storage/ path and full URL forms the app may send', async () => {
    const a = touch('image-u7-1-a.jpg');
    const b = touch('image-u7-1-b.jpg');
    await service.removeImage(7, '/storage/image-u7-1-a.jpg');
    await service.removeImage(
      7,
      'https://api.example.com/storage/image-u7-1-b.jpg',
    );
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(false);
  });

  it("refuses another user's upload with 403", async () => {
    const file = touch('image-u8-1700000000000-1.jpg');
    await expect(
      service.removeImage(7, 'image-u8-1700000000000-1.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('does not confuse user 1 with user 12', async () => {
    const file = touch('image-u12-1.jpg');
    await expect(
      service.removeImage(1, 'image-u12-1.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('allows a legacy upload referenced by one of your posts', async () => {
    const file = touch('image-1690000000000-5.jpg');
    postRepository.query.mockResolvedValue([{ '?column?': 1 }]);
    const res = await service.removeImage(7, 'image-1690000000000-5.jpg');
    expect(res.success).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(postRepository.query.mock.calls[0][1]).toEqual([
      7,
      'image-1690000000000-5.jpg',
    ]);
  });

  it('refuses a legacy upload not referenced by your posts', async () => {
    const file = touch('image-1690000000000-6.jpg');
    await expect(
      service.removeImage(7, 'image-1690000000000-6.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('refuses files in sub-folders such as other users’ avatars', async () => {
    fs.writeFileSync(path.join(root, 'user', 'image-u7-avatar.jpg'), 'x');
    await expect(
      service.removeImage(7, 'user/image-u7-avatar.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns "not found" for your own missing file', async () => {
    const res = await service.removeImage(7, 'image-u7-missing.jpg');
    expect(res).toEqual({ success: false, message: 'Image not found' });
  });
});

describe('resolveInsideStorage', () => {
  it('keeps normal names inside the root', () => {
    expect(resolveInsideStorage('/srv/storage', 'a.jpg')).toBe(
      '/srv/storage/a.jpg',
    );
  });
  it('rejects the root itself', () => {
    expect(() => resolveInsideStorage('/srv/storage', '.')).toThrow(
      BadRequestException,
    );
  });
  it('rejects a sibling directory that shares the prefix', () => {
    expect(() =>
      resolveInsideStorage('/srv/storage', '../storage-old/a.jpg'),
    ).toThrow(BadRequestException);
  });
});
