import { BadRequestException } from '@nestjs/common';

/** Opaque pagination cursor: base64url JSON. Clients must not parse it. */
export function encodeCursor(state: object): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor made by encodeCursor. Returns null for "no cursor"
 * (first page) and throws 400 for anything malformed or failing `isValid`.
 */
export function decodeCursor<T>(
  cursor: string | undefined | null,
  isValid: (value: any) => value is T,
): T | null {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  try {
    if (cursor.length > 1024) throw new Error('too long');
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (isValid(value)) return value;
  } catch {
    // fall through
  }
  throw new BadRequestException('Invalid cursor');
}

export const isNonNegativeInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0;
