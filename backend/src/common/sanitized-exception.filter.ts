import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from './request-id.middleware';

/**
 * Central error responses + safe logs: no Authorization/cookies/body.
 * Production: no stack or internal message for unexpected errors.
 */
@Catch()
export class SanitizedExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();
    const isProd = process.env.NODE_ENV === 'production';
    const path = req.originalUrl ?? req.url ?? '';
    const requestId = req.id;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      this.logLine('http_exception', status, req.method, path, requestId);
      return res.status(status).json(body);
    }

    const err = exception as Error;
    this.logLine(
      'unhandled',
      HttpStatus.INTERNAL_SERVER_ERROR,
      req.method,
      path,
      requestId,
    );
    if (!isProd && err?.stack) {
      console.error(err.stack.split('\n').slice(0, 12).join('\n'));
    }
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      ...(requestId ? { requestId } : {}),
    });
  }

  private logLine(
    kind: string,
    status: number,
    method: string,
    path: string,
    requestId: string | undefined,
  ): void {
    const line = JSON.stringify({
      level: status >= 500 ? 'error' : 'warn',
      kind,
      status,
      method,
      path,
      ...(requestId ? { requestId } : {}),
      ts: new Date().toISOString(),
    });
    if (status >= 500) console.error(line);
    else console.warn(line);
  }
}
