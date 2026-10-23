import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clampPhotoWidth, PlacePhotoService } from './place-photo.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');
const REF = 'AUGGfZkExampleReference_123-abc';

describe('clampPhotoWidth', () => {
  it.each([
    [undefined, 800],
    ['', 800],
    ['abc', 800],
    ['-5', 800],
    ['0', 800],
    ['1', 400],
    ['400', 400],
    ['401', 800],
    ['800', 800],
    ['801', 1200],
    ['1200', 1200],
    ['5000', 1200],
    ['1e9', 1200],
    [640, 800],
  ])('w=%j → %d', (input, expected) => {
    expect(clampPhotoWidth(input)).toBe(expected);
  });
});

describe('PlacePhotoService', () => {
  let dir: string;
  let clock: number;
  let google: { photo: jest.Mock };
  let service: PlacePhotoService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-m1-photos-'));
    clock = Date.now();
    google = {
      photo: jest
        .fn()
        .mockResolvedValue({ bytes: JPEG, contentType: 'image/jpeg' }),
    };
    service = new PlacePhotoService(google as any);
    (service as any).cacheDir = dir;
    (service as any).now = () => clock;
  });

  it('fetches with the clamped width and serves the next request from disk', async () => {
    const first = await service.getPhoto(REF, '1000');
    expect(google.photo).toHaveBeenCalledWith(REF, 1200);
    expect(first).toEqual({ bytes: JPEG, contentType: 'image/jpeg' });

    const second = await service.getPhoto(REF, '1100'); // same bucket
    expect(google.photo).toHaveBeenCalledTimes(1);
    expect(second.bytes.equals(JPEG)).toBe(true);
    expect(second.contentType).toBe('image/jpeg');
  });

  it('caches each width separately', async () => {
    await service.getPhoto(REF, '400');
    await service.getPhoto(REF, '800');
    expect(google.photo.mock.calls.map((c) => c[1])).toEqual([400, 800]);
  });

  it('refetches after 24 h', async () => {
    await service.getPhoto(REF, '800');
    clock += 24 * 60 * 60_000 + 1000;
    google.photo.mockResolvedValue({ bytes: PNG, contentType: 'image/png' });
    const again = await service.getPhoto(REF, '800');
    expect(google.photo).toHaveBeenCalledTimes(2);
    expect(again.contentType).toBe('image/png');
  });

  it('stores files under a hash, never the client string', async () => {
    await service.getPhoto(REF, '800');
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{64}-800$/);
  });

  it.each(['../../etc/passwd', 'a/b', 'short', 'ref with spaces 1234567', ''])(
    'rejects reference %j with 400',
    async (ref) => {
      await expect(service.getPhoto(ref, '800')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(google.photo).not.toHaveBeenCalled();
    },
  );
});
