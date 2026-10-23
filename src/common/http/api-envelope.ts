/** Contract success envelope for new endpoints. */
export interface ApiEnvelope<T> {
  success: true;
  message?: string;
  data: T;
}

export function ok<T>(data: T, message?: string): ApiEnvelope<T> {
  return message ? { success: true, message, data } : { success: true, data };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
