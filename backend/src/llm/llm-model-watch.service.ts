import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { isSentryEnabled } from '../instrument';
import { LlmClient, type LlmModelCheck } from './llm-client';

/** Boot check runs after this delay so it never slows the readiness probe. */
const FIRST_CHECK_DELAY_MS = 5_000;
/** Then every day. A retired model is known within 24 h, not after eleven days. */
export const LLM_MODEL_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

/**
 * Asks the provider, at boot and once a day, whether `LLM_MODEL` still
 * exists. A failure is an ERROR-level Sentry event (Sentry emails new issues
 * by default) and an error log line; a pass is one info line. The generator
 * itself keeps working through the rule-based fallback either way; this is
 * the part that was missing in August, the NOTIFICATION.
 *
 * `lastCheck` is exposed for `/health/ready`, so the probe reflects the
 * model's existence without its own request.
 */
@Injectable()
export class LlmModelWatch
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(LlmModelWatch.name);
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;
  lastCheck: (LlmModelCheck & { at: string }) | null = null;

  constructor(
    private readonly llm: LlmClient,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    if (!this.llm.isConfigured) {
      this.logger.warn(
        `[LlmModelWatch] no API key for provider ${this.llm.provider}: every plan will be rule-based`,
      );
      return;
    }
    this.first = setTimeout(() => void this.runCheck(), FIRST_CHECK_DELAY_MS);
    this.first.unref();
    this.timer = setInterval(
      () => void this.runCheck(),
      LLM_MODEL_CHECK_INTERVAL_MS,
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  async runCheck(): Promise<LlmModelCheck> {
    const result = await this.llm.checkModel();
    this.lastCheck = { ...result, at: new Date().toISOString() };
    if (result.ok) {
      this.logger.log(
        `[LlmModelWatch] model ok provider=${result.provider} model=${result.model}`,
      );
      return result;
    }
    this.logger.error(
      `[LlmModelWatch] MODEL UNAVAILABLE provider=${result.provider} model=${result.model} detail=${result.detail ?? 'n/a'} — plans are rule-based until LLM_MODEL is changed`,
    );
    if (isSentryEnabled) {
      Sentry.withScope((scope) => {
        scope.setLevel('error');
        scope.setTag('llm.provider', result.provider);
        scope.setTag('llm.model', result.model);
        scope.setContext('llm', {
          provider: result.provider,
          model: result.model,
          detail: result.detail ?? null,
        });
        Sentry.captureMessage(
          `LLM model unavailable (${result.provider}: ${result.model})`,
        );
      });
    }
    return result;
  }
}
