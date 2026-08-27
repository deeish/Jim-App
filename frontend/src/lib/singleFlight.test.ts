import { singleFlight } from './singleFlight';

/** A promise whose settlement this test controls. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('singleFlight', () => {
  it('runs the function once for concurrent callers', async () => {
    const d = deferred<string>();
    let calls = 0;
    const run = singleFlight(() => {
      calls++;
      return d.promise;
    });

    const a = run();
    const b = run();
    const c = run();
    expect(calls).toBe(1);

    d.resolve('token-1');
    await expect(a).resolves.toBe('token-1');
    await expect(b).resolves.toBe('token-1');
    await expect(c).resolves.toBe('token-1');
    expect(calls).toBe(1);
  });

  it('hands every concurrent caller the SAME promise', () => {
    const run = singleFlight(() => new Promise<number>(() => {}));
    expect(run()).toBe(run());
  });

  it('starts a fresh call once the previous one has settled', async () => {
    let calls = 0;
    const run = singleFlight(async () => {
      calls++;
      return calls;
    });

    await expect(run()).resolves.toBe(1);
    await expect(run()).resolves.toBe(2);
    expect(calls).toBe(2);
  });

  it('delivers a rejection to every waiter', async () => {
    const d = deferred<string>();
    const run = singleFlight(() => d.promise);

    const a = run();
    const b = run();
    d.reject(new Error('refresh failed'));

    await expect(a).rejects.toThrow('refresh failed');
    await expect(b).rejects.toThrow('refresh failed');
  });

  it('does NOT let a failure poison the next call', async () => {
    // A refresh that fails once must not disable refreshing forever — that
    // would turn one bad network moment into a permanent sign-out loop.
    let calls = 0;
    const run = singleFlight(async () => {
      calls++;
      if (calls === 1) throw new Error('first fails');
      return 'ok';
    });

    await expect(run()).rejects.toThrow('first fails');
    await expect(run()).resolves.toBe('ok');
  });

  it('a caller arriving after settlement gets a new run, not a stale value', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let calls = 0;
    const run = singleFlight(() => {
      calls++;
      return calls === 1 ? first.promise : second.promise;
    });

    const a = run();
    first.resolve('old');
    await a;

    const b = run();
    second.resolve('new');
    await expect(b).resolves.toBe('new');
    expect(calls).toBe(2);
  });
});
