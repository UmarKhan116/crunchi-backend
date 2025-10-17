export interface ApiResponse<T = any> {
  message: string;
  data?: T;
  success: boolean;
  statusCode: number;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
