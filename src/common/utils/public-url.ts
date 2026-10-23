import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Absolute origin used to build media URLs ("https://api.crunchiiapp.com").
 * PUBLIC_BASE_URL wins; otherwise the request's own protocol and host
 * (X-Forwarded-* are honoured through Express "trust proxy").
 */
export function resolvePublicBaseUrl(request: any): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const host = request?.get?.('host') ?? request?.headers?.host ?? 'localhost';
  return `${request?.protocol ?? 'http'}://${host}`;
}

/** `@BaseUrl() baseUrl: string` in a controller handler. */
export const BaseUrl = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    resolvePublicBaseUrl(context.switchToHttp().getRequest()),
);

/**
 * Folders under /storage/ that the app already uses:
 * posts → storage/, category icons → storage/category/,
 * avatars → storage/user/, ads → storage/video/.
 */
export type StorageFolder = '' | 'category' | 'user' | 'video';

export function buildMediaUrl(
  baseUrl: string,
  folder: StorageFolder,
  file: string | null | undefined,
): string | null {
  if (!file) return null;
  if (/^https?:\/\//i.test(file)) return file;
  if (file.startsWith('/storage/')) return `${baseUrl}${file}`;
  const clean = file.replace(/^\/+/, '');
  return folder
    ? `${baseUrl}/storage/${folder}/${clean}`
    : `${baseUrl}/storage/${clean}`;
}
