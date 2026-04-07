import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Rate limits AI / Groq-backed HTTP endpoints per authenticated user (fallback: IP).
 * Logs when a client is throttled for operations / cost monitoring.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AiThrottlerGuard.name);

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const uid = req.user?.id;
    if (typeof uid === 'string' && uid.length > 0) {
      return `ai:user:${uid}`;
    }
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    return `ai:ip:${ip}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<Record<string, any>>();
    const tracker = await this.getTracker(req);
    const path = req?.originalUrl ?? req?.url ?? '';
    this.logger.warn(
      `AI rate limit exceeded: ${tracker} path=${path} limit=${detail.limit} totalHits=${detail.totalHits} key=${detail.key}`,
    );
    return super.throwThrottlingException(context, detail);
  }
}
