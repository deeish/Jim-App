import {
  MAX_DETAIL_CHARS,
  describeError,
  fallbackLogLine,
  reportGenerationFallback,
} from './generation-fallback';

describe('describeError', () => {
  it('takes the message off an Error', () => {
    expect(describeError(new Error('404 model_decommissioned'))).toBe(
      '404 model_decommissioned',
    );
  });

  it('accepts a thrown string', () => {
    expect(describeError('socket hang up')).toBe('socket hang up');
  });

  it('bounds a long message', () => {
    const long = 'x'.repeat(MAX_DETAIL_CHARS + 50);
    const out = describeError(new Error(long));
    expect(out).toHaveLength(MAX_DETAIL_CHARS + 1); // + the ellipsis
    expect(out?.endsWith('…')).toBe(true);
  });

  it('refuses to stringify an arbitrary object', () => {
    // ⚠ A thrown HTTP error can carry the entire request — including a prompt
    // built from the user's training history — and this text reaches Sentry.
    expect(describeError({ config: { data: 'secret prompt' } })).toBeNull();
  });

  it('is null for nothing useful', () => {
    expect(describeError(null)).toBeNull();
    expect(describeError(undefined)).toBeNull();
    expect(describeError(new Error('   '))).toBeNull();
  });
});

describe('fallbackLogLine', () => {
  it('is greppable and names the model', () => {
    expect(
      fallbackLogLine({
        stage: 'generateWorkout',
        reason: 'llm-error',
        model: 'llama-3.3-70b-versatile',
        detail: '404 model_decommissioned',
      }),
    ).toBe(
      '[GenerationFallback] served a rule-based plan — stage=generateWorkout ' +
        'reason=llm-error model=llama-3.3-70b-versatile detail=404 model_decommissioned',
    );
  });

  it('omits fields it does not have', () => {
    expect(
      fallbackLogLine({ stage: 'generateFullProgram', reason: 'llm-unusable' }),
    ).toBe(
      '[GenerationFallback] served a rule-based plan — ' +
        'stage=generateFullProgram reason=llm-unusable',
    );
  });
});

describe('reportGenerationFallback', () => {
  it('always logs, even with Sentry switched off', () => {
    // The log line is the floor: it must survive an unconfigured environment,
    // which is every local run and every test.
    const warn = jest.fn();
    reportGenerationFallback(
      { warn },
      { stage: 'generateWorkout', reason: 'llm-unusable' },
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('reason=llm-unusable');
  });
});
