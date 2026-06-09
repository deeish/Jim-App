import {
  runWithGenerationSignal,
  currentGenerationSignal,
} from './generation-abort.context';

describe('generation-abort.context', () => {
  it('exposes the signal to nested async code within the run scope', async () => {
    const ac = new AbortController();
    const seen = await runWithGenerationSignal(ac.signal, async () => {
      await Promise.resolve();
      return currentGenerationSignal();
    });
    expect(seen).toBe(ac.signal);
  });

  it('reflects abort state through the context', async () => {
    const ac = new AbortController();
    const aborted = await runWithGenerationSignal(ac.signal, async () => {
      ac.abort();
      await Promise.resolve();
      return currentGenerationSignal()?.aborted;
    });
    expect(aborted).toBe(true);
  });

  it('returns undefined outside any run scope', () => {
    expect(currentGenerationSignal()).toBeUndefined();
  });
});
