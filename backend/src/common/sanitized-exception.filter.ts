import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Response } from 'express';
import { isSentryEnabled } from '../instrument';
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
      if (status >= 500) {
        this.reportToSentry(exception, req, status);
      }
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
    this.reportToSentry(err, req, HttpStatus.INTERNAL_SERVER_ERROR);
    if (!isProd && err?.stack) {
      console.error(err.stack.split('\n').slice(0, 12).join('\n'));
    }
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      ...(requestId ? { requestId } : {}),
    });
  }

  private reportToSentry(
    exception: unknown,
    req: RequestWithId,
    status: number,
  ): void {
    if (!isSentryEnabled) return;
    Sentry.withScope((scope) => {
      if (req.id) scope.setTag('request_id', req.id);
      scope.setTag('http.status', String(status));
      scope.setContext('request', {
        method: req.method,
        path: req.originalUrl ?? req.url ?? '',
        request_id: req.id,
      });
      Sentry.captureException(exception);
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
