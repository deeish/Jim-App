import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

const SAFE_ID = /^[A-Za-z0-9_\-.]+$/;

export type RequestWithId = Request & { id?: string };

/**
 * Honor an upstream X-Request-Id if it looks safe, otherwise mint one.
 * The bound is to keep log lines tidy and to avoid header / log injection.
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header('x-request-id')?.trim();
  const safe =
    incoming &&
    incoming.length > 0 &&
    incoming.length <= 128 &&
    SAFE_ID.test(incoming)
      ? incoming
      : null;
  const id = safe ?? randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
