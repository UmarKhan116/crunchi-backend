import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
} from '@nestjs/common';

/**
 * Contract error envelope: `{ success: false, message, errors? }` with a real
 * HTTP status. `statusCode` and `error` are kept because legacy app builds
 * read them from Nest's default error body.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (response.headersSent) return;

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        (exception as Error)?.message,
        (exception as Error)?.stack,
      );
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    }

    const status = exception.getStatus();
    const body = exception.getResponse() as any;
    let message: string = exception.message;
    let errors: Record<string, string[]> | undefined;
    let error: string | undefined;

    if (typeof body === 'string') {
      message = body;
    } else if (body && typeof body === 'object') {
      error = body.error;
      errors = body.errors;
      if (Array.isArray(body.message)) {
        message = body.message[0] ?? message;
      } else if (typeof body.message === 'string') {
        message = body.message;
      }
    }

    return response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      ...(error ? { error } : {}),
    });
  }
}

/** ValidationPipe exceptionFactory: field-keyed errors for the envelope. */
export function validationExceptionFactory(
  validationErrors: ValidationError[],
) {
  const errors: Record<string, string[]> = {};
  const walk = (list: ValidationError[], prefix: string) => {
    for (const e of list) {
      const field = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) errors[field] = Object.values(e.constraints);
      if (e.children?.length) walk(e.children, field);
    }
  };
  walk(validationErrors, '');
  const first = Object.values(errors)[0]?.[0] ?? 'Validation failed';
  return new BadRequestException({
    message: first,
    errors,
    error: 'Bad Request',
  });
}
