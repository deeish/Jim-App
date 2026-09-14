import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai';
import Groq from 'groq-sdk';

/**
 * The one door every generation prompt goes through.
 *
 * ⚠ WHY THIS EXISTS. The previous model id was hardcoded in three call sites,
 * so when Groq retired it on 2026-08-16 the app served rule-based plans for
 * eleven days before anyone noticed. Now the provider and model are ENV
 * (`LLM_PROVIDER`, `LLM_MODEL`), the three call sites share `completeJson`,
 * and `checkModel` asks the provider whether the id still exists so a
 * retirement announces itself (see `LlmModelWatch`).
 *
 * Providers:
 * - `gemini` (default): Gemini API via `@google/genai`, JSON-schema enforced
 *   output, thinking at MINIMAL. Paid tier only: the free tier trains on
 *   prompts, which the privacy policy promises we do not allow.
 * - `groq`: a second code path, NOT a dependable fallback. OpenAI-compatible chat
 *   completions with `json_schema` output; `openai/gpt-oss-120b` probed live on
 *   2026-09-13 and 2026-09-14. ⚠ The account behind it is the FREE tier, which Groq
 *   is withdrawing, and 8k tokens/minute is below what one plan spends (~8.4k across
 *   two batch calls in ~12 s, measured 2026-09-14). It answers a probe; it cannot
 *   carry traffic. Gemini is therefore a single point of failure whose real safety
 *   net is the rule-based builder. See "A real second provider" in docs/future.md.
 */

export type LlmProvider = 'gemini' | 'groq';

export const LLM_DEFAULT_MODEL: Readonly<Record<LlmProvider, string>> = {
  gemini: 'gemini-3.5-flash-lite',
  groq: 'openai/gpt-oss-120b',
};

const LLM_KEY_ENV: Readonly<Record<LlmProvider, string>> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
};

/** One provider call: the wall clock cap, after which the call is retried once. */
export const LLM_DEFAULT_TIMEOUT_MS = 45_000;

export interface LlmSettings {
  provider: LlmProvider;
  model: string;
  /** `null` when the selected provider has no key: generation runs rule-based. */
  apiKey: string | null;
  timeoutMs: number;
}

export function resolveLlmSettings(
  get: (key: string) => string | undefined,
): LlmSettings {
  const rawProvider = get('LLM_PROVIDER')?.trim().toLowerCase();
  const provider: LlmProvider =
    rawProvider === 'groq' || rawProvider === 'gemini' ? rawProvider : 'gemini';
  const model = get('LLM_MODEL')?.trim() || LLM_DEFAULT_MODEL[provider];
  const apiKey = get(LLM_KEY_ENV[provider])?.trim() || null;
  const timeoutRaw = Number(get('LLM_TIMEOUT_MS'));
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? timeoutRaw
      : LLM_DEFAULT_TIMEOUT_MS;
  return { provider, model, apiKey, timeoutMs };
}

/** A JSON Schema object (the subset both providers accept). */
export type LlmJsonSchema = Record<string, unknown>;

export interface LlmJsonRequest {
  /** Short stage name for logs and the Groq schema name, e.g. `generateFullProgram`. */
  label: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  /**
   * Output cap for the JSON itself. Gemini bills thinking tokens against the
   * same cap, so the client adds headroom on top of this figure.
   */
  maxOutputTokens: number;
  /** Enforced by the provider (Gemini `responseJsonSchema`, Groq `json_schema`). */
  schema: LlmJsonSchema;
  /** The request-scoped abort signal; an abort is never retried. */
  signal?: AbortSignal;
}

/**
 * Provider-neutral finish reason. `length` is the one callers act on: the
 * output was cut, so the JSON is not trustworthy even if it parses.
 */
export type LlmFinishReason = 'stop' | 'length' | 'safety' | 'other';

/** One completion, for log aggregation and captures (no prompt, no PII). */
export type LlmCompletionUsage = {
  prompt_tokens?: number;
  /** Includes thinking tokens on Gemini (they bill as output). */
  completion_tokens?: number;
  total_tokens?: number;
  thought_tokens?: number;
  finish_reason?: LlmFinishReason | null;
  provider?: LlmProvider;
  model?: string;
};

export interface LlmJsonResult {
  /** The model's text, or `null` when it produced none (blocked, empty). */
  text: string | null;
  usage: LlmCompletionUsage;
}

export interface LlmModelCheck {
  ok: boolean;
  provider: LlmProvider;
  model: string;
  /** Bounded error text when `ok` is false. */
  detail?: string;
}

/** Statuses worth one more attempt; everything else is a real failure. */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Headroom over the requested cap for Gemini's thinking tokens at MINIMAL. */
function geminiOutputCap(requested: number): number {
  return Math.ceil(requested * 1.25) + 512;
}

function mapGeminiFinish(reason: FinishReason | undefined): LlmFinishReason {
  switch (reason) {
    case FinishReason.STOP:
    case undefined:
      return 'stop';
    case FinishReason.MAX_TOKENS:
      return 'length';
    case FinishReason.SAFETY:
    case FinishReason.RECITATION:
    case FinishReason.BLOCKLIST:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.SPII:
      return 'safety';
    default:
      return 'other';
  }
}

function mapGroqFinish(reason: string | null | undefined): LlmFinishReason {
  if (reason == null || reason === 'stop') return 'stop';
  if (reason === 'length') return 'length';
  if (reason === 'content_filter') return 'safety';
  return 'other';
}

function isRetryable(err: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return false;
  const status = (err as { status?: unknown })?.status;
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status);
  // No HTTP status: a timeout, a reset socket, a DNS blip. One more try.
  return true;
}

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);
  readonly settings: LlmSettings;
  private gemini: GoogleGenAI | null = null;
  private groq: Groq | null = null;

  constructor(config: ConfigService) {
    this.settings = resolveLlmSettings((k) => config.get<string>(k));
  }

  /** Build one without Nest, for scripts and tests. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
    return new LlmClient({
      get: (k: string) => env[k],
    } as unknown as ConfigService);
  }

  get provider(): LlmProvider {
    return this.settings.provider;
  }

  get model(): string {
    return this.settings.model;
  }

  /** False when the selected provider has no key; callers skip straight to rules. */
  get isConfigured(): boolean {
    return this.settings.apiKey !== null;
  }

  /** `provider:model`, for log lines and fallback reports. */
  get describe(): string {
    return `${this.settings.provider}:${this.settings.model}`;
  }

  /**
   * One JSON completion with a timeout and a single retry on transient
   * failure. Throws when the provider could not be reached or refused the
   * request; returns `text: null` when it answered with nothing usable.
   */
  async completeJson(req: LlmJsonRequest): Promise<LlmJsonResult> {
    if (!this.isConfigured) {
      throw new Error(
        `LLM not configured: ${LLM_KEY_ENV[this.settings.provider]} is unset`,
      );
    }
    let attempt = 0;
    for (;;) {
      try {
        return this.settings.provider === 'gemini'
          ? await this.completeGemini(req)
          : await this.completeGroq(req);
      } catch (err) {
        if (attempt === 0 && isRetryable(err, req.signal)) {
          attempt += 1;
          this.logger.warn(
            `[LLM:${req.label}] retrying once after ${describeStatus(err)}`,
          );
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Does the configured model id still exist at the provider? Cheap metadata
   * GET, no tokens. `ok: false` with a 404-ish detail is the retirement signal.
   */
  async checkModel(): Promise<LlmModelCheck> {
    const { provider, model } = this.settings;
    if (!this.isConfigured) {
      return { ok: false, provider, model, detail: 'no api key' };
    }
    try {
      if (provider === 'gemini') {
        await this.geminiClient().models.get({
          model,
          config: { httpOptions: { timeout: 10_000 } },
        });
      } else {
        await this.groqClient().models.retrieve(model, { timeout: 10_000 });
      }
      return { ok: true, provider, model };
    } catch (err) {
      return { ok: false, provider, model, detail: describeStatus(err) };
    }
  }

  private geminiClient(): GoogleGenAI {
    if (!this.gemini) {
      this.gemini = new GoogleGenAI({
        apiKey: this.settings.apiKey ?? undefined,
        httpOptions: {
          timeout: this.settings.timeoutMs,
          // Retries are ours (one, above), so they do not stack with the SDK's.
          retryOptions: { attempts: 1 },
        },
      });
    }
    return this.gemini;
  }

  private groqClient(): Groq {
    if (!this.groq) {
      this.groq = new Groq({
        apiKey: this.settings.apiKey ?? undefined,
        timeout: this.settings.timeoutMs,
        maxRetries: 0,
      });
    }
    return this.groq;
  }

  private async completeGemini(req: LlmJsonRequest): Promise<LlmJsonResult> {
    const { model } = this.settings;
    const res = await this.geminiClient().models.generateContent({
      model,
      contents: req.userPrompt,
      config: {
        systemInstruction: req.systemPrompt,
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        temperature: req.temperature,
        maxOutputTokens: geminiOutputCap(req.maxOutputTokens),
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal: req.signal,
      },
    });
    const candidate = res.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text =
      parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('')
        .trim() || null;
    const u = res.usageMetadata;
    const thought = u?.thoughtsTokenCount ?? 0;
    const finish: LlmFinishReason = candidate
      ? mapGeminiFinish(candidate.finishReason)
      : res.promptFeedback?.blockReason
        ? 'safety'
        : 'other';
    return {
      text,
      usage: {
        prompt_tokens: u?.promptTokenCount,
        completion_tokens:
          u?.candidatesTokenCount != null
            ? u.candidatesTokenCount + thought
            : undefined,
        total_tokens: u?.totalTokenCount,
        thought_tokens: thought || undefined,
        finish_reason: finish,
        provider: 'gemini',
        model,
      },
    };
  }

  private async completeGroq(req: LlmJsonRequest): Promise<LlmJsonResult> {
    const { model } = this.settings;
    const res = await this.groqClient().chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.label, schema: req.schema },
        },
        temperature: req.temperature,
        max_tokens: req.maxOutputTokens,
        // gpt-oss reasons before it answers; keep that short. Other models 400 on the field.
        ...(model.includes('gpt-oss')
          ? { reasoning_effort: 'low' as const }
          : {}),
      },
      { signal: req.signal },
    );
    const choice = res.choices?.[0];
    const u = res.usage;
    return {
      text: choice?.message?.content?.trim() || null,
      usage: {
        prompt_tokens: u?.prompt_tokens,
        completion_tokens: u?.completion_tokens,
        total_tokens: u?.total_tokens,
        finish_reason: mapGroqFinish(choice?.finish_reason),
        provider: 'groq',
        model,
      },
    };
  }
}

/** `status message`, bounded; never the error object (it can carry the prompt). */
export function describeStatus(err: unknown): string {
  const status = (err as { status?: unknown })?.status;
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const head = typeof status === 'number' ? `${status} ` : '';
  const text = `${head}${message}`.trim() || 'unknown error';
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
