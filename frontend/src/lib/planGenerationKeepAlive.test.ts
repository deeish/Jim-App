import {
  isGenerationInFlight,
  resetKeepAliveForTests,
  runKeepAlive,
} from './planGenerationKeepAlive';

describe('runKeepAlive', () => {
  beforeEach(() => resetKeepAliveForTests());

  it('runs once per draft id and hands the same result to a second caller', async () => {
    let resolve!: (v: { ok: boolean; n: number }) => void;
    const run = jest.fn(
      () => new Promise<{ ok: boolean; n: number }>((r) => (resolve = r)),
    );
    const persist = jest.fn(async () => {});
    const a = runKeepAlive('d1', run, persist);
    expect(isGenerationInFlight('d1')).toBe(true);
    const b = runKeepAlive('d1', run, persist); // the screen remounted
    expect(run).toHaveBeenCalledTimes(1);
    resolve({ ok: true, n: 7 });
    await expect(a).resolves.toEqual({ ok: true, n: 7 });
    await expect(b).resolves.toEqual({ ok: true, n: 7 });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(isGenerationInFlight('d1')).toBe(false);
  });

  it('does not persist a failed run, and a later call starts fresh', async () => {
    const run = jest
      .fn<Promise<{ ok: boolean }>, []>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const persist = jest.fn(async () => {});
    await expect(runKeepAlive('d2', run, persist)).resolves.toEqual({ ok: false });
    expect(persist).not.toHaveBeenCalled();
    await expect(runKeepAlive('d2', run, persist)).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('still returns the result when persisting throws', async () => {
    const run = async () => ({ ok: true });
    const persist = async () => {
      throw new Error('storage full');
    };
    await expect(runKeepAlive('d3', run, persist)).resolves.toEqual({ ok: true });
    expect(isGenerationInFlight('d3')).toBe(false);
  });
});
