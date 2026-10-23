import { UnsupportedMediaTypeException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MediaService } from './media.service';
import { looksLikeHeic } from './heic-converter';

const FIXTURE = path.join(
  __dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'tiny.heic',
);

describe('MediaService.uploadImage HEIC conversion', () => {
  let dir: string;
  const service = new MediaService({} as any, {} as any);

  const stored = (name: string, bytes: Buffer, mimetype: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes);
    return {
      filename: name,
      originalname: name,
      path: file,
      mimetype,
    } as Express.Multer.File;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-m2-heic-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('recognises HEIC by its ftyp brand', () => {
    expect(looksLikeHeic(fs.readFileSync(FIXTURE).subarray(0, 12))).toBe(true);
    expect(looksLikeHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });

  it('stores a HEIC upload as JPEG and removes the original', async () => {
    const file = stored(
      'image-u7-1-1.heic',
      fs.readFileSync(FIXTURE),
      'image/heic',
    );
    const res = await service.uploadImage(file);
    expect(res).toEqual({
      success: true,
      message: 'Image uploaded successfully',
      url: 'image-u7-1-1.jpg',
      path: '/storage/image-u7-1-1.jpg',
    });
    const jpeg = fs.readFileSync(path.join(dir, 'image-u7-1-1.jpg'));
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(fs.existsSync(file.path)).toBe(false);
  }, 30_000);

  it('converts a HEIC that was sent with a .jpg name', async () => {
    const file = stored(
      'image-u7-1-2.jpg',
      fs.readFileSync(FIXTURE),
      'image/jpeg',
    );
    const res = await service.uploadImage(file);
    expect(res.url).toBe('image-u7-1-2.jpg');
    const jpeg = fs.readFileSync(path.join(dir, 'image-u7-1-2.jpg'));
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  }, 30_000);

  it('rejects an unreadable HEIC with 415 and leaves no file behind', async () => {
    const file = stored(
      'image-u7-1-3.heic',
      Buffer.from('not really a heic file'),
      'image/heic',
    );
    await expect(service.uploadImage(file)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    expect(fs.readdirSync(dir)).toEqual([]);
  }, 30_000);

  it('leaves JPEG uploads untouched', async () => {
    const file = stored(
      'image-u7-1-4.jpg',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7]),
      'image/jpeg',
    );
    expect((await service.uploadImage(file)).url).toBe('image-u7-1-4.jpg');
    expect(fs.existsSync(file.path)).toBe(true);
  });
});
