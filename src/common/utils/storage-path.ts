import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

/** The directory served at /storage/ (see main.ts). */
export const STORAGE_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'storage',
);

/**
 * Turns what a client sent ("image-1.jpg", "/storage/image-1.jpg" or a full
 * URL to it) into an absolute path, and refuses anything that would end up
 * outside `root` (../, absolute paths, encoded traversal, NUL bytes).
 */
export function resolveInsideStorage(root: string, input: string): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new BadRequestException('A file name is required');
  }
  let name = input.trim();
  try {
    if (/^https?:\/\//i.test(name)) name = new URL(name).pathname;
    name = decodeURIComponent(name);
  } catch {
    throw new BadRequestException('Invalid file path');
  }
  if (name.includes('\0')) throw new BadRequestException('Invalid file path');
  name = name.replace(/^\/?storage\//, '');
  if (path.isAbsolute(name) || /^[a-zA-Z]:/.test(name)) {
    throw new BadRequestException('Invalid file path');
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, path.normalize(name));
  if (!resolved.startsWith(resolvedRoot + path.sep)) {
    throw new BadRequestException('Invalid file path');
  }
  return resolved;
}
