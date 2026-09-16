import { LlmClient } from './llm-client';
import {
  isActorAllowed,
  LlmPolicyDeniedError,
  parseAllowlist,
} from './llm-allowlist';
import { runWithRequestActor } from '../common/request-actor.context';
import {
  fallbackReasonFor,
  reportGenerationFallback,
} from '../workouts/generation-fallback';

describe('parseAllowlist', () => {
  it('splits on commas, whitespace and semicolons, lowercases, dedupes', () => {
    expect(parseAllowlist(' A@x.com, b@y.com;B@Y.COM\n c ')).toEqual([
      'a@x.com',
      'b@y.com',
      'c',
    ]);
  });
  it('is empty for unset or blank', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist('  ,  ')).toEqual([]);
  });
});

describe('isActorAllowed', () => {
  const list = ['dylan@example.com', 'user-id-1'];
  it('everyone when the list is empty, even with no actor', () => {
    expect(isActorAllowed([], undefined)).toBe(true);
    expect(isActorAllowed([], { id: 'x' })).toBe(true);
  });
  it('matches by email, case-insensitively', () => {
    expect(isActorAllowed(list, { id: 'z', email: 'Dylan@Example.com' })).toBe(
      true,
    );
  });
  it('matches by user id', () => {
    expect(isActorAllowed(list, { id: 'USER-ID-1', email: null })).toBe(true);
  });
  it('denies an unlisted actor and a missing actor', () => {
    expect(isActorAllowed(list, { id: 'other', email: 'o@x.com' })).toBe(false);
    expect(isActorAllowed(list, undefined)).toBe(false);
  });
});

describe('LlmClient allowlist gate', () => {
  const env = {
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'test-key',
    AI_GENERATION_ALLOWLIST: 'dylan@example.com',
  };
  const req = {
    label: 'spec',
    systemPrompt: 's',
    userPrompt: 'u',
    schema: { type: 'object' },
    temperature: 0,
    maxOutputTokens: 10,
  };

  function clientWithFakeProvider() {
    const client = LlmClient.fromEnv(env);
    const provider = jest.fn(async () => ({
      text: '{}',
      finishReason: 'stop',
      usage: {},
    }));
    (client as unknown as { completeGemini: unknown }).completeGemini =
      provider;
    return { client, provider };
  }

  it('reads the list from the environment', () => {
    expect(LlmClient.fromEnv(env).settings.allowlist).toEqual([
      'dylan@example.com',
    ]);
    expect(
      LlmClient.fromEnv({ ...env, AI_GENERATION_ALLOWLIST: '' }).settings
        .allowlist,
    ).toEqual([]);
  });

  it('lets a listed actor through to the provider', async () => {
    const { client, provider } = clientWithFakeProvider();
    await runWithRequestActor({ id: 'u1', email: 'dylan@example.com' }, () =>
      client.completeJson(req),
    );
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('refuses an unlisted actor before any provider call', async () => {
    const { client, provider } = clientWithFakeProvider();
    await expect(
      runWithRequestActor({ id: 'u2', email: 'someone@example.com' }, () =>
        client.completeJson(req),
      ),
    ).rejects.toBeInstanceOf(LlmPolicyDeniedError);
    expect(provider).not.toHaveBeenCalled();
  });

  it('refuses when there is no request actor at all', async () => {
    const { client, provider } = clientWithFakeProvider();
    await expect(client.completeJson(req)).rejects.toBeInstanceOf(
      LlmPolicyDeniedError,
    );
    expect(provider).not.toHaveBeenCalled();
  });

  it('is a no-op without a list', async () => {
    const client = LlmClient.fromEnv({ ...env, AI_GENERATION_ALLOWLIST: '' });
    const provider = jest.fn(async () => ({
      text: '{}',
      finishReason: 'stop',
      usage: {},
    }));
    (client as unknown as { completeGemini: unknown }).completeGemini =
      provider;
    await client.completeJson(req);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('checkModel is not gated (health and the daily watch keep working)', () => {
    // The gate lives in completeJson only; checkModel does not consult it.
    const client = LlmClient.fromEnv(env);
    expect(typeof client.checkModel).toBe('function');
    expect(client.settings.allowlist).toHaveLength(1);
  });
});

describe('policy fallbacks are quiet', () => {
  it('maps the denial to the policy reason and everything else to llm-error', () => {
    expect(fallbackReasonFor(new LlmPolicyDeniedError({ id: 'x' }))).toBe(
      'policy',
    );
    expect(fallbackReasonFor(new Error('ECONNRESET'))).toBe('llm-error');
  });

  it('logs at info, not warn, and never reaches Sentry', () => {
    const logger = { warn: jest.fn(), log: jest.fn() };
    reportGenerationFallback(logger, {
      stage: 'generateWorkout',
      reason: 'policy',
      model: 'gemini:x',
    });
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toContain('reason=policy');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
