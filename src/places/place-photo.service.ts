import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { STORAGE_ROOT } from '../common/utils/storage-path';
import { GooglePlacesClient } from './google/google-places.client';
import { PHOTO_DEFAULT_WIDTH, PHOTO_WIDTHS, TTL } from './places.constants';

/** Google photo references are URL-safe base64. */
const PHOTO_REF_PATTERN = /^[A-Za-z0-9_-]{10,2048}$/;

/** Any requested width becomes 400, 800 or 1200 (the smallest that covers it). */
export function clampPhotoWidth(raw: unknown): number {
  const w = Number(raw);
  if (
    raw === undefined ||
    raw === null ||
    raw === '' ||
    !Number.isFinite(w) ||
    w <= 0
  ) {
    return PHOTO_DEFAULT_WIDTH;
  }
  return (
    PHOTO_WIDTHS.find((allowed) => w <= allowed) ??
    PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1]
  );
}

function sniffImageType(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.subarray(0, 3).toString() === 'GIF') return 'image/gif';
  return 'image/jpeg';
}

export interface PhotoResult {
  bytes: Buffer;
  contentType: string;
}

/**
 * GET /api/places/photo/:ref. Fetches with the server key and keeps the bytes
 * on disk under storage/place-photos/ for 24 h (file mtime), named by a hash
 * of the reference so nothing from the client becomes a path.
 */
@Injectable()
export class PlacePhotoService {
  private readonly logger = new Logger(PlacePhotoService.name);
  private readonly inFlight = new Map<string, Promise<PhotoResult>>();
  /** Overridable in tests. */
  protected cacheDir = path.join(STORAGE_ROOT, 'place-photos');

  constructor(private readonly google: GooglePlacesClient) {}

  /** Overridable in tests. */
  protected now(): number {
    return Date.now();
  }

  async getPhoto(ref: string, rawWidth: unknown): Promise<PhotoResult> {
    if (!PHOTO_REF_PATTERN.test(ref ?? '')) {
      throw new BadRequestException('Invalid photo reference');
    }
    const width = clampPhotoWidth(rawWidth);
    const file = path.join(
      this.cacheDir,
      `${createHash('sha256').update(ref).digest('hex')}-${width}`,
    );

    const cached = await this.readFresh(file);
    if (cached) return cached;

    const pending = this.inFlight.get(file);
    if (pending) return pending;
    const promise = this.fetchAndStore(ref, width, file).finally(() =>
      this.inFlight.delete(file),
    );
    this.inFlight.set(file, promise);
    return promise;
  }

  private async readFresh(file: string): Promise<PhotoResult | null> {
    try {
      const stat = await fs.stat(file);
      if (this.now() - stat.mtimeMs > TTL.photo) return null;
      const bytes = await fs.readFile(file);
      return { bytes, contentType: sniffImageType(bytes) };
    } catch {
      return null;
    }
  }

  private async fetchAndStore(ref: string, width: number, file: string) {
    const photo = await this.google.photo(ref, width);
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, photo.bytes);
      await fs.rename(tmp, file);
    } catch (error) {
      // A full disk should not break the response.
      this.logger.warn(`could not cache photo: ${error?.message}`);
    }
    return photo;
  }
}
