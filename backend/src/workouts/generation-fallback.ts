import * as Sentry from '@sentry/node';
import { isSentryEnabled } from '../instrument';

/**
 * Reporting for a generation that quietly fell back to rule-based output.
 *
 * ⚠ WHY THIS EXISTS. On 2026-08-16 Groq decommissioned the model this service
 * asks for by name. Every generation from that moment served a rule-based plan
 * instead of an LLM one — and nobody noticed for ELEVEN DAYS. Not because the
 * failure was hidden, but because it was only ever a `logger.warn` in a log
 * nobody watches, and one of the two fallback paths did not even log that:
 * `outcome.ok === false` fell through in total silence.
 *
 * Sentry could not have caught it either. The generator CATCHES the failure
 * and returns a usable plan, so there is no unhandled exception for the error
 * filter to report. A degraded product is not a crash, which is exactly what
 * makes it able to run for a week and a half.
 *
 * So a fallback is now reported deliberately, as a warning-level MESSAGE
 * rather than an exception: nothing broke, the user got a workout, but the
 * thing they were promised did not happen, and someone should know.
 */

export type FallbackReason =
  /** The call threw — network, auth, a decommissioned model id, a 5xx. */
  | 'llm-error'
  /** It answered, and the answer could not be used (truncated, invalid). */
  | 'llm-unusable';

export interface GenerationFallback {
  /** Which generator fell back, e.g. `generateWorkout`. */
  stage: string;
  reason: FallbackReason;
  /**
   * The model that was asked for. Carried on purpose: when a provider retires
   * a model, this is the field that names the culprit in the first report.
   */
  model?: string;
  /** Bounded error text; never the raw error object. */
  detail?: string | null;
}

/** Long enough to identify a failure, short enough not to ship a payload. */
export const MAX_DETAIL_CHARS = 200;

/**
 * Error text, trimmed and bounded.
 *
 * ⚠ Never the object. A thrown HTTP error can carry the whole request on it,
 * and this text goes to Sentry — a prompt containing a user's training history
 * is not something to leak into an error tracker.
 */
export function describeError(err: unknown): string | null {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : null;
  const text = raw?.trim();
  if (!text) return null;
  return text.length > MAX_DETAIL_CHARS
    ? `${text.slice(0, MAX_DETAIL_CHARS)}…`
    : text;
}

/** One greppable line, so this is findable in plain logs as well as Sentry. */
export function fallbackLogLine(fallback: GenerationFallback): string {
  const parts = [
    `stage=${fallback.stage}`,
    `reason=${fallback.reason}`,
    fallback.model ? `model=${fallback.model}` : null,
    fallback.detail ? `detail=${fallback.detail}` : null,
  ].filter(Boolean);
  return `[GenerationFallback] served a rule-based plan — ${parts.join(' ')}`;
}

/** Minimal logger surface, so callers can pass a Nest logger or a fake. */
export interface FallbackLogger {
  warn(message: string): void;
}

export function reportGenerationFallback(
  logger: FallbackLogger,
  fallback: GenerationFallback,
): void {
  logger.warn(fallbackLogLine(fallback));
  if (!isSentryEnabled) return;
  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('generation.stage', fallback.stage);
    scope.setTag('generation.fallback_reason', fallback.reason);
    if (fallback.model) scope.setTag('generation.model', fallback.model);
    scope.setContext('generation', {
      stage: fallback.stage,
      reason: fallback.reason,
      model: fallback.model ?? null,
      detail: fallback.detail ?? null,
    });
    // Grouped by stage and reason, NOT by detail: a provider outage produces
    // one issue that climbs, rather than a thousand near-identical ones whose
    // volume is the only interesting thing about them.
    Sentry.captureMessage(
      `Generation fell back to rules (${fallback.stage}: ${fallback.reason})`,
    );
  });
}
